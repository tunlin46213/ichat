/**
 * iChat push + call-token server on Cloudflare Workers (free plan, no card).
 * Replaces Firebase Cloud Functions so the Firebase project can stay on Spark.
 *
 *   POST /notify        { chatId, body, call? }  → push the new message / call to the other member
 *   POST /stream-token                           → Stream Video user token (native calls)
 *   POST /bark          { key, preview } | { key: null }  → save / remove my Bark device key
 *   POST /bark-status                            → { enabled, preview }
 *   POST /bark-test                              → test notification to my own phone
 *   POST /story-posted   { storyId }             → "X posted a story" to their contacts
 *   POST /moment-activity { momentId, kind, text? } → "X liked / commented on your moment"
 *   cron (hourly)                                → delete expired stories and their photos
 *   POST /admin/users                            → every account (admins only, config/admins.uids)
 *   POST /admin/user/disable { uid, disabled }   → block / allow sign-in
 *   POST /admin/user/delete  { uid }             → delete the account and its profile data
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
        'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/identitytoolkit',
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
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
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
const MISSED_CALL = /^(📞|📹) Missed (voice|video) call$/u;
const SAFE_PREVIEW = /^(📷 Photo|🎤 Voice message.*|📍 (Live location|Location)|📞 .*|📹 .*)$/u;

async function barkSettings(env: Env, uid: string) {
  if (!env.BARK) return null;
  return env.BARK.get<BarkSettings>(`bark:${uid}`, 'json');
}

async function sendBark(
  settings: BarkSettings,
  msg: { title: string; body: string; url: string; group: string; id: string; call?: boolean; silent?: boolean }
) {
  const sound = msg.silent
    ? // Quiet hours: listed in Notification Center, no sound, no banner.
      { level: 'passive' }
    : msg.call
      ? // Rings for ~30 s and breaks through Focus (if allowed in Bark's settings).
        { call: '1', sound: 'multiwayinvitation', level: 'timeSensitive' }
      : { sound: 'chime' };
  return fetch('https://api.day.app/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      device_key: settings.key,
      title: msg.title,
      body: msg.body,
      group: msg.group,
      // Same id = the newer alert replaces the older one (one per chat).
      id: msg.id,
      url: msg.url,
      icon: ICON,
      ...sound,
    }),
  });
}

type Quiet = { on: boolean; start: number; end: number; calls: boolean; offset: number };

/** users/{uid}/private/push.quiet (Settings → Quiet Hours). */
function parseQuiet(push: FsDoc | null): Quiet | null {
  const f = push?.fields?.quiet?.mapValue?.fields;
  if (!f) return null;
  const num = (v?: FsValue) => Number(v?.integerValue ?? v?.doubleValue ?? NaN);
  const q = {
    on: f.on?.booleanValue === true,
    start: num(f.start),
    end: num(f.end),
    calls: f.calls?.booleanValue !== false,
    offset: num(f.offset) || 0,
  };
  return q.on && Number.isInteger(q.start) && Number.isInteger(q.end) ? q : null;
}

/** Inside their quiet hours, in their own time zone. */
function isQuietNow(q: Quiet, now = Date.now()) {
  const local = new Date(now + q.offset * 60_000);
  const h = local.getUTCHours();
  if (q.start === q.end) return false;
  return q.start < q.end ? h >= q.start && h < q.end : h >= q.start || h < q.end;
}

let ringingCache: { on: boolean; expires: number } | null = null;

/**
 * config/app.androidStreamRinging: the Stream dashboard has the Firebase push provider,
 * so Stream itself rings Android phones (our own call alert would be a duplicate).
 */
async function androidStreamRinging(env: Env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return false;
  if (!ringingCache || ringingCache.expires < Date.now()) {
    const cfg = await getDoc(env, 'config/app');
    ringingCache = { on: cfg?.fields?.androidStreamRinging?.booleanValue === true, expires: Date.now() + 60_000 };
  }
  return ringingCache.on;
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

  // With iChat open, its own banner / incoming-call screen shows it already.
  const inApp = await isInApp(env, caller, recipientId);

  // Their settings (service account only): blocks, quiet hours, unread count, tokens.
  let quiet: Quiet | null = null;
  let unread = 0;
  let androidTokens: string[] = [];
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const [blocks, push, chat] = await Promise.all([
      getDoc(env, `blocks/${recipientId}`),
      getDoc(env, `users/${recipientId}/private/push`),
      call ? Promise.resolve(null) : getDoc(env, `chats/${chatId}`),
    ]);
    // Messages from blocked people are refused by the rules, but calls are not: check here.
    if (strings(blocks?.fields?.blocked).includes(senderId)) return json({ sent: 0 });
    quiet = parseQuiet(push);
    androidTokens = strings(push?.fields?.androidTokens);
    unread = Number(chat?.fields?.unread?.mapValue?.fields?.[recipientId]?.integerValue ?? 0);
  }
  const silent = !!quiet && isQuietNow(quiet) && !(call && quiet.calls);
  // Several unread in a row: one alert per chat, "Bae (3 new)".
  const title = !call && unread > 1 ? `${name} (${unread} new)` : name;
  // The ringing alert and the "Missed call" entry share a slot, so the latter replaces it.
  const slot = call || MISSED_CALL.test(body) ? `call-${chatId}` : chatId;

  const jobs: Promise<Response>[] = [];

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
    jobs.push(sendBark(bark, { title, body: text, url: link, group: chatId, id: slot, call: !!call, silent }));
  }

  // Android app: straight to the phone with Firebase Cloud Messaging (free). Calls are
  // left to Stream's own ringing push (full-screen incoming call) once that is set up.
  const streamRings = !!call && (await androidStreamRinging(env));
  if (androidTokens.length && !inApp && !streamRings) {
    jobs.push(
      ...(await androidPush(env, { senderId, recipientId, chatId, name, title, body, call, silent, slot, unread, tokens: androidTokens }))
    );
  }

  // Web push (FCM) and Expo push need the service account (not set up on the free path).
  if (env.FIREBASE_SERVICE_ACCOUNT && !call) jobs.push(...(await legacyPush(env, senderId, recipientId, chatId, body)));

  const results = await Promise.allSettled(jobs);
  return json({ sent: results.filter((r) => r.status === 'fulfilled' && r.value.ok).length });
}

async function androidPush(
  env: Env,
  msg: {
    senderId: string;
    recipientId: string;
    chatId: string;
    name: string;
    title: string;
    body: string;
    call: CallInfo | null;
    silent: boolean;
    slot: string;
    unread: number;
    tokens: string[];
  }
) {
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
  return msg.tokens.map((token) =>
    fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: msg.title, body: text },
          data,
          android: {
            priority: 'HIGH',
            // A call alert is useless once it has stopped ringing.
            ttl: call ? '40s' : '86400s',
            notification: {
              // Quiet hours: the silent channel (made by the app, src/lib/push.ts).
              channel_id: msg.silent ? 'quiet' : call ? 'calls' : 'messages',
              // One alert per chat (a newer message replaces the older one).
              tag: msg.slot,
              ...(msg.silent ? {} : { sound: 'default' }),
              notification_priority: msg.silent ? 'PRIORITY_LOW' : call ? 'PRIORITY_MAX' : 'PRIORITY_HIGH',
              visibility: call ? 'PUBLIC' : 'PRIVATE',
              ...(msg.unread > 1 && !call ? { notification_count: msg.unread } : {}),
            },
          },
        },
      }),
    }).then(async (res) => {
      // The phone got a new token (or iChat was uninstalled): forget this one.
      if (res.status === 404) await removeAndroidToken(env, msg.recipientId, token).catch(() => {});
      return res;
    })
  );
}

/** Drops a dead FCM token from users/{uid}/private/push.androidTokens. */
async function removeAndroidToken(env: Env, uid: string, token: string) {
  const name = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}/private/push`;
  await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writes: [
          {
            transform: {
              document: name,
              fieldTransforms: [{ fieldPath: 'androidTokens', removeAllFromArray: { values: [{ stringValue: token }] } }],
            },
          },
        ],
      }),
    }
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
    id: 'ichat-test',
  });
  return json({ ok: res.ok }, res.ok ? 200 : 502);
}

// ─── Stories: alerts and hourly clean-up ─────────────────────────────────────

/** Firestore structured query (service account). */
async function runQuery(env: Env, structuredQuery: unknown) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery }),
    }
  );
  if (!res.ok) throw new Error(`runQuery ${res.status}`);
  const rows = (await res.json()) as { document?: FsDoc & { name: string } }[];
  return rows.flatMap((r) => (r.document ? [r.document] : []));
}

/** Tells the poster's contacts (people they have a chat with) about a new story. */
async function storyPosted(env: Env, caller: Caller, storyId: string) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ sent: 0 });
  const story = await getDoc(env, `stories/${storyId}`);
  if (story?.fields?.ownerId?.stringValue !== caller.uid) return json({ error: 'not your story' }, 403);
  // One alert per story, however often this is called (retries, or on purpose).
  if (env.BARK) {
    const key = `story-alerted:${storyId}`;
    if (await env.BARK.get(key)) return json({ sent: 0, reason: 'already sent' });
    await env.BARK.put(key, '1', { expirationTtl: 2 * 86400 });
  }
  const chats = await runQuery(env, {
    from: [{ collectionId: 'chats' }],
    where: { fieldFilter: { field: { fieldPath: 'members' }, op: 'ARRAY_CONTAINS', value: { stringValue: caller.uid } } },
    limit: 300,
  });
  const contacts = [...new Set(chats.flatMap((c) => strings(c.fields?.members)).filter((m) => m !== caller.uid))];
  const name = caller.name?.trim() || 'Someone';
  const body = story.fields?.kind?.stringValue === 'text' ? 'posted a new story 💬' : 'posted a new story 📷';
  const url = `ichat://story/${caller.uid}`;
  const auth = `Bearer ${await accessToken(env)}`;
  const jobs: Promise<Response>[] = [];

  await Promise.all(
    contacts.map(async (uid) => {
      const [blocks, push] = await Promise.all([getDoc(env, `blocks/${uid}`), getDoc(env, `users/${uid}/private/push`)]);
      if (strings(blocks?.fields?.blocked).includes(caller.uid)) return;
      if (push?.fields?.storyAlerts?.booleanValue === false) return;
      if (strings(push?.fields?.mutedStories).includes(caller.uid)) return;
      if (await isInApp(env, caller, uid)) return; // their stories row shows it
      const quiet = parseQuiet(push);
      const silent = !!quiet && isQuietNow(quiet);
      const bark = await barkSettings(env, uid);
      if (bark) {
        jobs.push(sendBark(bark, { title: name, body, url, group: 'stories', id: `story-${caller.uid}`, silent }));
      }
      for (const token of strings(push?.fields?.androidTokens)) {
        jobs.push(
          fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
            method: 'POST',
            headers: { Authorization: auth, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                token,
                notification: { title: name, body },
                // Read by the app when tapped (src/app/_layout.tsx → story viewer).
                data: { story: caller.uid },
                android: {
                  priority: 'NORMAL',
                  ttl: '86400s',
                  notification: {
                    channel_id: silent ? 'quiet' : 'messages',
                    tag: `story-${caller.uid}`,
                    ...(silent ? {} : { sound: 'default' }),
                  },
                },
              },
            }),
          })
        );
      }
    })
  );
  const results = await Promise.allSettled(jobs);
  return json({ sent: results.filter((r) => r.status === 'fulfilled' && r.value.ok).length });
}

/** "Bae liked your moment" / "Bae commented: …" on the moment author's phone. */
async function momentActivity(env: Env, caller: Caller, momentId: string, kind: 'like' | 'comment', text: string) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ sent: 0 });
  const moment = await getDoc(env, `moments/${momentId}`);
  const authorId = moment?.fields?.authorId?.stringValue;
  if (!authorId || authorId === caller.uid) return json({ sent: 0 });
  // A like alerts once per person per moment, however often it is toggled.
  if (kind === 'like' && env.BARK) {
    const key = `moment-like:${momentId}:${caller.uid}`;
    if (await env.BARK.get(key)) return json({ sent: 0, reason: 'already sent' });
    await env.BARK.put(key, '1', { expirationTtl: 30 * 86400 });
  }
  const [blocks, push] = await Promise.all([getDoc(env, `blocks/${authorId}`), getDoc(env, `users/${authorId}/private/push`)]);
  if (strings(blocks?.fields?.blocked).includes(caller.uid)) return json({ sent: 0 });
  if (await isInApp(env, caller, authorId)) return json({ sent: 0 });
  const quiet = parseQuiet(push);
  const silent = !!quiet && isQuietNow(quiet);
  const name = caller.name?.trim() || 'Someone';
  const jobs: Promise<Response>[] = [];
  const bark = await barkSettings(env, authorId);
  const body = (preview: boolean) =>
    kind === 'like' ? 'liked your moment ❤️' : preview && text ? `commented: ${text}` : 'commented on your moment 💬';
  if (bark) {
    jobs.push(
      sendBark(bark, { title: name, body: body(bark.preview), url: `ichat://moment/${momentId}`, group: 'moments', id: `moment-${momentId}`, silent })
    );
  }
  const auth = `Bearer ${await accessToken(env)}`;
  for (const token of strings(push?.fields?.androidTokens)) {
    jobs.push(
      fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: name, body: body(true) },
            // Read by the app when tapped (src/app/_layout.tsx → the moment).
            data: { moment: momentId },
            android: {
              priority: 'NORMAL',
              ttl: '86400s',
              notification: {
                channel_id: silent ? 'quiet' : 'messages',
                tag: `moment-${momentId}`,
                ...(silent ? {} : { sound: 'default' }),
              },
            },
          },
        }),
      })
    );
  }
  const results = await Promise.allSettled(jobs);
  return json({ sent: results.filter((r) => r.status === 'fulfilled' && r.value.ok).length });
}

/**
 * Hourly (wrangler.toml [triggers]): deletes stories past their 24 hours and their
 * photos, so they stop using the free 1 GB even if the owner never opens the app.
 */
async function cleanUpStories(env: Env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return 0;
  const expired = await runQuery(env, {
    from: [{ collectionId: 'stories' }],
    where: {
      fieldFilter: { field: { fieldPath: 'expiresAt' }, op: 'LESS_THAN', value: { timestampValue: new Date().toISOString() } },
    },
    limit: 300,
  });
  for (const story of expired) {
    const id = story.name.split('/').pop()!;
    await Promise.all([deleteFsDoc(env, `stories/${id}`), deleteFsDoc(env, `storyMedia/${id}`)]);
  }
  return expired.length;
}

// ─── /admin/* (only uids listed in Firestore config/admins.uids) ────────────

let adminCache: { uids: string[]; expires: number } | null = null;

async function isAdmin(env: Env, uid: string) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return false;
  if (!adminCache || adminCache.expires < Date.now()) {
    const doc = await getDoc(env, 'config/admins');
    adminCache = { uids: strings(doc?.fields?.uids), expires: Date.now() + 60_000 };
  }
  return adminCache.uids.includes(uid);
}

const identity = (env: Env, path: string) =>
  `https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/${path}`;

type AuthUser = {
  localId: string;
  email?: string;
  displayName?: string;
  emailVerified?: boolean;
  disabled?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
};

async function listDocs(env: Env, path: string) {
  const out: (FsDoc & { name?: string })[] = [];
  let pageToken = '';
  do {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`,
      { headers: { Authorization: `Bearer ${await accessToken(env)}` } }
    );
    if (!res.ok) break;
    const page = (await res.json()) as { documents?: (FsDoc & { name?: string })[]; nextPageToken?: string };
    out.push(...(page.documents ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

/** Accounts (Firebase Auth) merged with their profile, app build and alert setup. */
async function adminUsers(env: Env) {
  const auth = `Bearer ${await accessToken(env)}`;
  const accounts: AuthUser[] = [];
  let pageToken = '';
  do {
    const res = await fetch(identity(env, `accounts:batchGet?maxResults=500${pageToken ? `&nextPageToken=${pageToken}` : ''}`), {
      headers: { Authorization: auth },
    });
    if (!res.ok) return json({ error: `auth ${res.status}` }, 502);
    const page = (await res.json()) as { users?: AuthUser[]; nextPageToken?: string };
    accounts.push(...(page.users ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);

  const profiles = new Map((await listDocs(env, 'users')).map((d) => [d.name?.split('/').pop() ?? '', d.fields ?? {}]));
  const users = await Promise.all(
    accounts.map(async (a) => {
      const p = profiles.get(a.localId) ?? {};
      const push = await getDoc(env, `users/${a.localId}/private/push`);
      const apps = p.apps?.mapValue?.fields ?? {};
      return {
        uid: a.localId,
        email: a.email ?? null,
        name: p.name?.stringValue ?? a.displayName ?? null,
        emailVerified: !!a.emailVerified,
        disabled: !!a.disabled,
        createdAt: Number(a.createdAt ?? 0) || null,
        lastLoginAt: Number(a.lastLoginAt ?? 0) || null,
        lastSeen: Date.parse(p.lastSeen?.timestampValue ?? '') || null,
        hasProfile: profiles.has(a.localId),
        // One entry per platform the person has opened iChat on (newest build there).
        devices: Object.entries(apps).map(([platform, v]) => {
          const f = v.mapValue?.fields ?? {};
          return {
            platform,
            build: f.build?.stringValue ?? null,
            buildTime: Number(f.buildTime?.integerValue ?? 0) || null,
            at: Date.parse(f.at?.timestampValue ?? '') || null,
          };
        }),
        androidPush: strings(push?.fields?.androidTokens).length,
        bark: !!(await barkSettings(env, a.localId)),
        quiet: parseQuiet(push) !== null,
      };
    })
  );
  return json({ users });
}

async function adminDisable(env: Env, uid: string, disabled: boolean) {
  const res = await fetch(identity(env, 'accounts:update'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' },
    // validSince: also ends sessions that are already signed in (at their next token refresh).
    body: JSON.stringify({
      localId: uid,
      disableUser: disabled,
      ...(disabled ? { validSince: String(Math.floor(Date.now() / 1000)) } : {}),
    }),
  });
  return json({ ok: res.ok }, res.ok ? 200 : 502);
}

async function deleteFsDoc(env: Env, path: string) {
  await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${await accessToken(env)}` },
  });
}

/** Deletes the sign-in account and the person's own data. Their chats stay for the other person. */
async function adminDelete(env: Env, uid: string) {
  const res = await fetch(identity(env, 'accounts:delete'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid }),
  });
  if (!res.ok) return json({ ok: false }, 502);
  await Promise.all([
    deleteFsDoc(env, `users/${uid}`),
    deleteFsDoc(env, `users/${uid}/private/push`),
    deleteFsDoc(env, `users/${uid}/private/starred`),
    deleteFsDoc(env, `blocks/${uid}`),
    env.BARK?.delete(`bark:${uid}`),
  ]);
  return json({ ok: true });
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
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      cleanUpStories(env).then(
        (n) => console.log(`story clean-up: ${n} expired`),
        (err) => console.error('story clean-up failed', err)
      )
    );
  },

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
      if (pathname === '/story-posted') {
        const { storyId } = (await request.json()) as { storyId?: string };
        if (!storyId || !/^[A-Za-z0-9]{10,40}$/.test(storyId)) return json({ error: 'bad request' }, 400);
        return await storyPosted(env, caller, storyId);
      }
      if (pathname === '/moment-activity') {
        const { momentId, kind, text } = (await request.json()) as { momentId?: string; kind?: string; text?: string };
        if (!momentId || !/^[A-Za-z0-9]{10,40}$/.test(momentId) || (kind !== 'like' && kind !== 'comment')) {
          return json({ error: 'bad request' }, 400);
        }
        return await momentActivity(env, caller, momentId, kind, typeof text === 'string' ? text.slice(0, 120) : '');
      }
      if (pathname.startsWith('/admin/')) {
        if (!(await isAdmin(env, uid))) return json({ error: 'forbidden' }, 403);
        if (pathname === '/admin/users') return await adminUsers(env);
        const { uid: target, disabled } = (await request.json()) as { uid?: string; disabled?: boolean };
        if (!target || !/^[A-Za-z0-9]{10,128}$/.test(target)) return json({ error: 'bad request' }, 400);
        // An admin can't lock themselves out from here.
        if (target === uid) return json({ error: 'not on your own account' }, 400);
        if (pathname === '/admin/user/disable') return await adminDisable(env, target, !!disabled);
        if (pathname === '/admin/user/delete') return await adminDelete(env, target);
      }
    } catch (err) {
      console.error(err);
      return json({ error: 'internal' }, 500);
    }
    return json({ error: 'not found' }, 404);
  },
};
