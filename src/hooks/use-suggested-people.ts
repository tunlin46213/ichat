import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import type { UserProfile } from '@/lib/chat';
import { db } from '@/lib/firebase';

/**
 * People on iChat I haven't chatted with yet, most recently active first. Read once
 * (not live) when the chat list opens.
 */
export function useSuggestedPeople(myUid: string, exclude: string[]) {
  const [people, setPeople] = useState<UserProfile[] | null>(null);
  useEffect(() => {
    let active = true;
    getDocs(query(collection(db, 'users'), orderBy('lastSeen', 'desc'), limit(30))).then(
      (snap) => active && setPeople(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserProfile)),
      () => active && setPeople([])
    );
    return () => {
      active = false;
    };
  }, [myUid]);
  const skip = new Set([myUid, ...exclude]);
  return (people ?? []).filter((p) => !skip.has(p.id) && p.name);
}
