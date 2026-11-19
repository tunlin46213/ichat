/**
 * iChat push + call-token server on Cloudflare Workers (free plan, no card).
 * Replaces Firebase Cloud Functions so the Firebase project can stay on Spark.
 *
 *   POST /notify        { chatId, body, call? }  → push the new message / call to the other member
 *   POST /stream-token                           → Stream Video user token (native calls)
 *   POST /bark          { key, preview } | { key: null }  → save / remove my Bark device key
 *   POST /bark-status                            → { enabled, preview }
 *   POST /bark-test                              → test notification to my own phone
 *
 * Bark (free iOS app, https://bark.day.app) gives lock-screen notifications to a
 * free-Apple-ID sideloaded iChat, which can't receive Apple push itself. Keys live in
 * the BARK KV namespace, never in Firestore, so chat partners can't see them.
 *
 * Every request must carry the caller's Firebase ID token: `Authorization: Bearer …`.
 */

export interface Env {
  FIREBASE_PROJECT_ID: string;
  /** Service-account JSON (Firebase console → Project settings → Service accounts). Secret. */
  FIREBASE_SERVICE_ACCOUNT: string;
  /** Optional, for voice calls. Secret. */
  STREAM_API_SECRET?: string;
  /** Site that opens when a web notification is tapped, e.g. https://ichat-2a37f.web.app */
  APP_URL: string;
  /** uid → Bark settings (wrangler.toml [[kv_namespaces]]). */
  BARK?: KVNamespace;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ─── base64url / JWT helpers ────────────────────────────────────────────────

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array | string) {
  const data = typeof bytes === 'string' ? enc.encode(bytes) : new Uint8Array(bytes);
  let s = '';
  for (const b of data) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodeJson<T>(part: string): T {
  return JSON.parse(new TextDecoder().decode(fromB64url(part))) as T;
}

// ─── Verify the caller's Firebase ID token ─────────────────────────────────

type Jwk = JsonWebKey & { kid: string };
let jwksCache: { keys: Jwk[]; expires: number } | null = null;

async function googleKeys() {
  if (jwksCache && jwksCache.expires > Date.now()) return jwksCache.keys;
  const res = await fetch(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  );
  const { keys } = (await res.json()) as { keys: Jwk[] };
  jwksCache = { keys, expires: Date.now() + 60 * 60 * 1000 };
  return keys;
}

type Caller = { uid: string; name: string | null; token: string };

/** Returns the caller (uid, display name, raw token), or null if the token is missing/invalid/expired. */
async function verifyIdToken(request: Request, projectId: string): Promise<Caller | null> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return null;
  const header = decodeJson<{ alg: string; kid: string }>(h);
  const payload = decodeJson<{ aud: string; iss: string; exp: number; sub: string; name?: string }>(p);
  const now = Date.now() / 1000;
  if (
    header.alg !== 'RS256' ||
    payload.aud !== projectId ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    payload.exp < now ||
    !payload.sub
  ) {
    return null;
  }
  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    fromB64url(sig),
    enc.encode(`${h}.${p}`)
  );
  return ok ? { uid: payload.sub, name: payload.name ?? null, token } : null;
}

// ─── Google access token from the service account ──────────────────────────

let accessCache: { token: string; expires: number } | null = null;

async function accessToken(env: Env) {
  if (accessCache && accessCache.expires > Date.now()) return accessCache.token;
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope:
        'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${claims}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }),
  });
  const data = (await res.json()) as { access_token: string; expires_in: number };
  accessCache = { token: data.access_token, expires: Date.now() + (data.expires_in - 120) * 1000 };
  return data.access_token;
}

// ─── Firestore REST (reads with the service account) ───────────────────────

type FsValue = {
  stringValue?: string;
  integerValue?: string;
  arrayValue?: { values?: FsValue[] };
  mapValue?: { fields?: Record<string, FsValue> };
};
type FsDoc = { fields?: Record<string, FsValue> };

async function getDoc(env: Env, path: string): Promise<FsDoc | null> {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`,
    { headers: { Authorization: `Bearer ${await accessToken(env)}` } }
  );
  return res.ok ? ((await res.json()) as FsDoc) : null;
}

const strings = (v?: FsValue) => v?.arrayValue?.values?.map((x) => x.stringValue ?? '') ?? [];

// ─── Bark ──────────────────────────────────────────────────────────────────

type BarkSettings = { key: string; preview: boolean };
const BARK_KEY = /^[A-Za-z0-9]{10,64}$/;
const ICON = 'https://raw.githubusercontent.com/tunlin46213/ichat/main/assets/images/icon.png';
/** Previews the app writes itself (safe to show even with message text hidden). */
const SAFE_PREVIEW = /^(📷 Photo|🎤 Voice message.*|📍 (Live location|Location)|📞 .*|📹 .*)$/u;

async function barkSettings(env: Env, uid: string) {
  if (!env.BARK) return null;
  return env.BARK.get<BarkSettings>(`bark:${uid}`, 'json');
}

async function sendBark(
  settings: BarkSettings,
  msg: { title: string; body: string; url: string; group: string; call?: boolean }
) {
  return fetch('https://api.day.app/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      device_key: settings.key,
      title: msg.title,
      body: msg.body,
      group: msg.group,
      url: msg.url,
      icon: ICON,
      ...(msg.call
        ? // Rings for ~30 s and breaks through Focus (if allowed in Bark's settings).
          { call: '1', sound: 'multiwayinvitation', level: 'timeSensitive' }
        : { sound: 'chime' }),
    }),
  });
}

/** Is the recipient looking at iChat right now? Then the in-app banner is enough. */
async function isInApp(env: Env, caller: Caller, uid: string) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}?mask.fieldPaths=inApp&mask.fieldPaths=lastSeen`,
    { headers: { Authorization: `Bearer ${caller.token}` } }
  );
  if (!res.ok) return false;
  const doc = (await res.json()) as { fields?: { inApp?: { booleanValue?: boolean }; lastSeen?: { timestampValue?: string } } };
  const seen = Date.parse(doc.fields?.lastSeen?.timestampValue ?? '') || 0;
  // The heartbeat runs every 60 s while the app is open; older means it was closed.
  return doc.fields?.inApp?.booleanValue === true && Date.now() - seen < 90_000;
}

// ─── /notify ───────────────────────────────────────────────────────────────

type CallInfo = { cid: string; video: boolean };

async function notify(env: Env, caller: Caller, chatId: string, body: string, call: CallInfo | null) {
  const senderId = caller.uid;
  // 1:1 chat ids are the two uids sorted and joined with "_".
  const members = chatId.split('_');
  if (members.length !== 2 || !members.includes(senderId)) return json({ error: 'not a member' }, 403);
  const recipientId = members.find((m) => m !== senderId) ?? '';
  if (!recipientId || recipientId === senderId) return json({ sent: 0 });

  const name = caller.name?.trim() || 'iChat';
  const link =
    `ichat://chat/${chatId}?otherId=${encodeURIComponent(senderId)}&name=${encodeURIComponent(name)}` +
    (call ? `&call=${encodeURIComponent(call.cid)}` : '');

  const jobs: Promise<Response>[] = [];

  // With iChat open, its own banner / incoming-call screen shows it already.
  const inApp = await isInApp(env, caller, recipientId);

  // Native iPhone app (free Apple ID): Bark.
  const bark = await barkSettings(env, recipientId);
  if (bark && !inApp) {
    const text = call
      ? call.video
        ? 'Incoming video call… tap to answer'
        : 'Incoming voice call… tap to answer'
      : bark.preview || SAFE_PREVIEW.test(body)
        ? body.slice(0, 180)
        : 'New message';
    jobs.push(sendBark(bark, { title: name, body: text, url: link, group: chatId, call: !!call }));
  }

  // Android app: straight to the phone with Firebase Cloud Messaging (free).
  if (env.FIREBASE_SERVICE_ACCOUNT && !inApp) {
    jobs.push(...(await androidPush(env, { senderId, recipientId, chatId, name, body, call })));
  }

  // Web push (FCM) and Expo push need the service account (not set up on the free path).
  if (env.FIREBASE_SERVICE_ACCOUNT && !call) jobs.push(...(await legacyPush(env, senderId, recipientId, chatId, body)));

  const results = await Promise.allSettled(jobs);
  return json({ sent: results.filter((r) => r.status === 'fulfilled' && r.value.ok).length });
}

async function androidPush(
  env: Env,
  msg: { senderId: string; recipientId: string; chatId: string; name: string; body: string; call: CallInfo | null }
) {
  const blocks = await getDoc(env, `blocks/${msg.recipientId}`);
  if (strings(blocks?.fields?.blocked).includes(msg.senderId)) return [];
  const push = await getDoc(env, `users/${msg.recipientId}/private/push`);
  const tokens = strings(push?.fields?.androidTokens);
  if (!tokens.length) return [];
  const auth = `Bearer ${await accessToken(env)}`;
  const { call } = msg;
  const text = call
    ? call.video
      ? 'Incoming video call… tap to answer'
      : 'Incoming voice call… tap to answer'
    : msg.body.slice(0, 180);
  // Read by the app when the alert is tapped (src/app/_layout.tsx → chat screen).
  const data: Record<string, string> = { chatId: msg.chatId, otherId: msg.senderId, name: msg.name };
  if (call) data.call = call.cid;
  return tokens.map((token) =>
    fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: msg.name, body: text },
          data,
          android: {
            priority: 'HIGH',
            // A call alert is useless once it has stopped ringing.
            ttl: call ? '40s' : '86400s',
            notification: {
              channel_id: call ? 'calls' : 'messages',
              // One alert per chat: a newer message replaces the older one.
              tag: call ? `call-${msg.chatId}` : msg.chatId,
              sound: 'default',
              notification_priority: call ? 'PRIORITY_MAX' : 'PRIORITY_HIGH',
              visibility: call ? 'PUBLIC' : 'PRIVATE',
            },
          },
        },
      }),
    })
  );
}

async function legacyPush(env: Env, senderId: string, recipientId: string, chatId: string, body: string) {
  // Respect blocks: no notifications from people the recipient blocked.
  const blocks = await getDoc(env, `blocks/${recipientId}`);
  if (strings(blocks?.fields?.blocked).includes(senderId)) return [];
  const chat = await getDoc(env, `chats/${chatId}`);
  const push = await getDoc(env, `users/${recipientId}/private/push`);
  const fcmTokens = strings(push?.fields?.fcmTokens);
  const expoTokens = strings(push?.fields?.tokens);
  const name = chat?.fields?.names?.mapValue?.fields?.[senderId]?.stringValue ?? 'New message';
  const badge = Number(chat?.fields?.unread?.mapValue?.fields?.[recipientId]?.integerValue ?? 1);
  const text = body.slice(0, 180);
  const data = { chatId, otherId: senderId, name };
  const link = `${env.APP_URL}/chat/${chatId}?otherId=${encodeURIComponent(senderId)}&name=${encodeURIComponent(name)}`;
  const jobs: Promise<Response>[] = [];

  // Web (PWA on iPhone home screen / desktop browsers) via FCM.
  if (fcmTokens.length) {
    const auth = `Bearer ${await accessToken(env)}`;
    for (const token of fcmTokens) {
      jobs.push(
        fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              data: { ...data, title: name, body: text, link, badge: String(badge) },
              webpush: { headers: { Urgency: 'high', TTL: '86400' } },
            },
          }),
        })
      );
    }
  }

  // Native app builds via the Expo push service.
  if (expoTokens.length) {
    jobs.push(
      fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          expoTokens.map((to) => ({ to, title: name, body: text, sound: 'default', badge, threadId: chatId, data }))
        ),
      })
    );
  }
  return jobs;
}

// ─── /bark, /bark-status, /bark-test ───────────────────────────────────────

async function saveBark(env: Env, uid: string, input: { key?: string | null; preview?: boolean }) {
  if (!env.BARK) return json({ error: 'bark not configured' }, 501);
  if (input.key === null) {
    await env.BARK.delete(`bark:${uid}`);
    return json({ enabled: false });
  }
  const current = await barkSettings(env, uid);
  const key = input.key ?? current?.key;
  if (!key || !BARK_KEY.test(key)) return json({ error: 'bad key' }, 400);
  const settings: BarkSettings = { key, preview: input.preview ?? current?.preview ?? false };
  await env.BARK.put(`bark:${uid}`, JSON.stringify(settings));
  return json({ enabled: true, preview: settings.preview });
}

async function testBark(env: Env, uid: string) {
  const bark = await barkSettings(env, uid);
  if (!bark) return json({ error: 'not set up' }, 404);
  const res = await sendBark(bark, {
    title: 'iChat',
    body: 'Notifications are working 🎉',
    url: 'ichat://chats',
    group: 'ichat-test',
  });
  return json({ ok: res.ok }, res.ok ? 200 : 502);
}

// ─── /stream-token ─────────────────────────────────────────────────────────

async function streamToken(env: Env, uid: string) {
  if (!env.STREAM_API_SECRET) return json({ error: 'calls not configured' }, 501);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ user_id: uid, iat: now - 60, exp: now + 24 * 3600 }));
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(env.STREAM_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${payload}`));
  return json({ token: `${header}.${payload}.${b64url(sig)}` });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);

    const caller = await verifyIdToken(request, env.FIREBASE_PROJECT_ID);
    if (!caller) return json({ error: 'unauthenticated' }, 401);
    const { uid } = caller;

    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/notify') {
        const { chatId, body, call } = (await request.json()) as { chatId?: string; body?: string; call?: CallInfo };
        if (!chatId || typeof body !== 'string') return json({ error: 'bad request' }, 400);
        const callInfo =
          call && typeof call.cid === 'string' && /^default:[A-Za-z0-9_-]{1,64}$/.test(call.cid)
            ? { cid: call.cid, video: !!call.video }
            : null;
        return await notify(env, caller, chatId, body, callInfo);
      }
      if (pathname === '/stream-token') return await streamToken(env, uid);
      if (pathname === '/bark') return await saveBark(env, uid, (await request.json()) as { key?: string | null; preview?: boolean });
      if (pathname === '/bark-status') {
        const bark = await barkSettings(env, uid);
        return json({ available: !!env.BARK, enabled: !!bark, preview: bark?.preview ?? false });
      }
      if (pathname === '/bark-test') return await testBark(env, uid);
    } catch (err) {
      console.error(err);
      return json({ error: 'internal' }, 500);
    }
    return json({ error: 'not found' }, 404);
  },
};
