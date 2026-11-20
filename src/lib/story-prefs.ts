import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase';

/**
 * My story settings, kept next to my push tokens (users/{uid}/private/push, owner-only)
 * so the push worker reads them in the same read:
 *   mutedStories  people whose stories I don't want to see (or be alerted about)
 *   storyAlerts   false = no "posted a story" alerts (default on)
 */
export type StoryPrefs = { mutedStories: string[]; storyAlerts: boolean };

const pushDoc = (uid: string) => doc(db, 'users', uid, 'private', 'push');

export function useStoryPrefs(uid: string | undefined) {
  const [prefs, setPrefs] = useState<{ uid: string; value: StoryPrefs } | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      pushDoc(uid),
      (snap) =>
        setPrefs({
          uid,
          value: {
            mutedStories: (snap.get('mutedStories') as string[] | undefined) ?? [],
            storyAlerts: snap.get('storyAlerts') !== false,
          },
        }),
      () => setPrefs({ uid, value: { mutedStories: [], storyAlerts: true } })
    );
  }, [uid]);
  return prefs && prefs.uid === uid ? prefs.value : null;
}

export function setStoriesMuted(uid: string, otherId: string, muted: boolean) {
  return setDoc(pushDoc(uid), { mutedStories: muted ? arrayUnion(otherId) : arrayRemove(otherId) }, { merge: true });
}

export function setStoryAlerts(uid: string, on: boolean) {
  return setDoc(pushDoc(uid), { storyAlerts: on }, { merge: true });
}
