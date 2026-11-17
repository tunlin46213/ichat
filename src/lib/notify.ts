import { auth } from '@/lib/firebase';
import { pushWorkerUrl } from '@/lib/runtime';

/**
 * Asks the push worker to notify the other chat member about a message I just sent.
 * Fire-and-forget: a failed notification must never fail the send.
 */
export function notifyRecipient(chatId: string, body: string) {
  const user = auth.currentUser;
  if (!pushWorkerUrl || !user) return;
  const base = pushWorkerUrl.replace(/\/$/, '');
  user
    .getIdToken()
    .then((idToken) =>
      fetch(`${base}/notify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, body }),
      })
    )
    .catch((err) => console.warn('Push notify failed', err));
}

/** Stream Video token for native voice calls (worker → /stream-token). */
export async function fetchStreamToken() {
  const user = auth.currentUser;
  if (!pushWorkerUrl || !user) throw new Error('Calls are not configured.');
  const res = await fetch(`${pushWorkerUrl.replace(/\/$/, '')}/stream-token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  if (!res.ok) throw new Error(`stream-token ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}
