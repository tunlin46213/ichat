import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase';

/**
 * Quiet hours: alerts still arrive, but silently. Saved next to my push tokens
 * (users/{uid}/private/push, owner-only); the push worker reads it before sending.
 * `offset` = my time zone (minutes east of UTC), so the worker knows my local hour.
 */
export type QuietHours = { on: boolean; start: number; end: number; calls: boolean; offset: number };

export const DEFAULT_QUIET: QuietHours = { on: false, start: 23, end: 7, calls: true, offset: 0 };

const pushDoc = (uid: string) => doc(db, 'users', uid, 'private', 'push');

export function useQuietHours(uid: string | undefined) {
  const [quiet, setQuiet] = useState<QuietHours | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      pushDoc(uid),
      (snap) => setQuiet({ ...DEFAULT_QUIET, ...((snap.get('quiet') as Partial<QuietHours>) ?? {}) }),
      () => setQuiet(DEFAULT_QUIET)
    );
  }, [uid]);
  return quiet;
}

export function saveQuietHours(uid: string, quiet: QuietHours) {
  // Refresh the time zone on every save (travel, daylight saving).
  const offset = -new Date().getTimezoneOffset();
  return setDoc(pushDoc(uid), { quiet: { ...quiet, offset } }, { merge: true });
}

export function formatHour(h: number) {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric' });
}
