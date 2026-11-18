import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import type { UserProfile } from '@/lib/chat';
import { db } from '@/lib/firebase';

/**
 * Live public profiles for several users at once (uid → profile). The chat list
 * needs them up front to filter by "Online", so rows don't each subscribe.
 */
export function useUserProfiles(uids: string[]) {
  const key = [...new Set(uids)].sort().join(',');
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    if (!key) return;
    const unsubscribes = key.split(',').map((uid) =>
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          if (!snap.exists()) return;
          setProfiles((prev) => ({ ...prev, [uid]: { id: uid, ...snap.data() } as UserProfile }));
        },
        () => {}
      )
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [key]);

  return profiles;
}
