import { auth } from '@/lib/firebase';
import { workerUrl } from '@/lib/remote-config';

export async function post(path: string, body?: unknown) {
  const user = auth.currentUser;
  const base = workerUrl();
  if (!base || !user) throw new Error('Notifications are not configured.');
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Asks the push worker to notify the other chat member about a message I just sent.
 * Fire-and-forget: a failed notification must never fail the send.
 */
export function notifyRecipient(chatId: string, body: string) {
  post('/notify', { chatId, body }).catch((err) => console.warn('Push notify failed', err));
}

/** Rings the other person's phone through Bark while my call is ringing. */
export function notifyCall(chatId: string, callCid: string, video: boolean) {
  post('/notify', { chatId, body: video ? '📹 Video call' : '📞 Voice call', call: { cid: callCid, video } }).catch(
    (err) => console.warn('Call notify failed', err)
  );
}

/** Tells my contacts' phones I posted a story (each can turn these alerts off). */
export function notifyStoryPosted(storyId: string) {
  post('/story-posted', { storyId }).catch((err) => console.warn('Story notify failed', err));
}

// ── Bark (lock-screen notifications for the free-Apple-ID build) ──

export type BarkStatus = { available: boolean; enabled: boolean; preview: boolean };

export async function getBarkStatus(): Promise<BarkStatus> {
  const res = await post('/bark-status');
  if (!res.ok) throw new Error(`bark-status ${res.status}`);
  return (await res.json()) as BarkStatus;
}

/**
 * Bark shows its key as a URL like https://api.day.app/AbC123xyz/ (or just the key).
 * Returns the key, or null if the text doesn't contain one.
 */
export function parseBarkKey(text: string) {
  const trimmed = text.trim();
  const fromUrl = trimmed.match(/^https?:\/\/[^/]+\/([A-Za-z0-9]{10,64})(?:[/?#]|$)/);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9]{10,64}$/.test(trimmed) ? trimmed : null;
}

export async function saveBark(settings: { key?: string | null; preview?: boolean }) {
  const res = await post('/bark', settings);
  if (!res.ok) throw new Error(`bark ${res.status}`);
  return (await res.json()) as { enabled: boolean; preview?: boolean };
}

export async function testBark() {
  const res = await post('/bark-test');
  if (!res.ok) throw new Error(`bark-test ${res.status}`);
}

/** Stream Video token for native voice calls (worker → /stream-token). */
export async function fetchStreamToken() {
  const user = auth.currentUser;
  const base = workerUrl();
  if (!base || !user) throw new Error('Calls are not configured.');
  const res = await fetch(`${base}/stream-token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  if (!res.ok) throw new Error(`stream-token ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}
