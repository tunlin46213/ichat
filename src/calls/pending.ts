/**
 * A ringing call opened from a Bark notification (ichat://chat/…?call=default:id).
 * The chat screen hands the call id over here; the Stream provider, once connected,
 * fetches it with client.onRingingCall() so the incoming-call screen appears.
 */
type Listener = (cid: string) => void;

let pending: string | null = null;
const listeners = new Set<Listener>();

export function ringPendingCall(cid: string) {
  pending = cid;
  listeners.forEach((l) => l(cid));
}

/** Calls `listener` now for a call waiting from before, and for each new one. */
export function onPendingCall(listener: Listener) {
  listeners.add(listener);
  if (pending) listener(pending);
  return () => {
    listeners.delete(listener);
  };
}

export function clearPendingCall(cid: string) {
  if (pending === cid) pending = null;
}
