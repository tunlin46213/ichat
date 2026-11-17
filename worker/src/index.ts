/**
 * iChat push + call-token server on Cloudflare Workers (free plan, no card).
 * Replaces Firebase Cloud Functions so the Firebase project can stay on Spark.
 *
 *   POST /notify        { chatId, body }   → push the new message to the other member
 *   POST /stream-token                     → Stream Video user token (native calls)
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

/** Returns the Firebase uid, or null if the token is missing/invalid/expired. */
async function verifyIdToken(request: Request, projectId: string) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return null;
  const header = decodeJson<{ alg: string; kid: string }>(h);
  const payload = decodeJson<{ aud: string; iss: string; exp: number; sub: string }>(p);
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
  return ok ? payload.sub : null;
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

// ─── /notify ───────────────────────────────────────────────────────────────

async function notify(env: Env, senderId: string, chatId: string, body: string) {
  const chat = await getDoc(env, `chats/${chatId}`);
  const members = strings(chat?.fields?.members);
  if (!members.includes(senderId)) return json({ error: 'not a member' }, 403);
  const recipientId = members.find((m) => m !== senderId);
  if (!recipientId) return json({ sent: 0 });

  // Respect blocks: no notifications from people the recipient blocked.
  const blocks = await getDoc(env, `blocks/${recipientId}`);
  if (strings(blocks?.fields?.blocked).includes(senderId)) return json({ sent: 0 });

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

  const results = await Promise.allSettled(jobs);
  return json({ sent: results.filter((r) => r.status === 'fulfilled' && r.value.ok).length });
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

    const uid = await verifyIdToken(request, env.FIREBASE_PROJECT_ID);
    if (!uid) return json({ error: 'unauthenticated' }, 401);

    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/notify') {
        const { chatId, body } = (await request.json()) as { chatId?: string; body?: string };
        if (!chatId || typeof body !== 'string') return json({ error: 'bad request' }, 400);
        return await notify(env, uid, chatId, body);
      }
      if (pathname === '/stream-token') return await streamToken(env, uid);
    } catch (err) {
      console.error(err);
      return json({ error: 'internal' }, 500);
    }
    return json({ error: 'not found' }, 404);
  },
};
