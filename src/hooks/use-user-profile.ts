import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import type { UserProfile } from '@/lib/chat';
import { db } from '@/lib/firebase';

/** Live public profile of a user (name, lastSeen for presence). */
export function useUserProfile(uid: string | undefined) {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'users', uid),
      (snap) => setProfile(snap.exists() ? ({ id: snap.id, ...snap.data() } as UserProfile) : null),
      () => setProfile(null)
    );
  }, [uid]);

  return profile;
}
