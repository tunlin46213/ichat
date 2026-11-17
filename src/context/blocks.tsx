import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/context/auth';
import { db } from '@/lib/firebase';

type BlocksContextValue = {
  /** user ids I have blocked */
  blocked: string[];
  isBlocked: (uid: string) => boolean;
  block: (uid: string) => Promise<void>;
  unblock: (uid: string) => Promise<void>;
};

const BlocksContext = createContext<BlocksContextValue | null>(null);

/**
 * My block list, stored privately in blocks/{myUid} (only I can read it).
 * Security rules also use it to reject messages from people I blocked.
 */
export function BlocksProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const myUid = user?.uid;
  const [blocked, setBlocked] = useState<string[]>([]);

  useEffect(() => {
    if (!myUid) return;
    return onSnapshot(
      doc(db, 'blocks', myUid),
      (snap) => setBlocked((snap.data()?.blocked as string[] | undefined) ?? []),
      () => setBlocked([])
    );
  }, [myUid]);

  async function block(uid: string) {
    if (!myUid) return;
    await setDoc(doc(db, 'blocks', myUid), { blocked: arrayUnion(uid) }, { merge: true });
  }

  async function unblock(uid: string) {
    if (!myUid) return;
    await setDoc(doc(db, 'blocks', myUid), { blocked: arrayRemove(uid) }, { merge: true });
  }

  return (
    <BlocksContext
      value={{ blocked: myUid ? blocked : [], isBlocked: (uid) => blocked.includes(uid), block, unblock }}>
      {children}
    </BlocksContext>
  );
}

export function useBlocks() {
  const ctx = use(BlocksContext);
  if (!ctx) throw new Error('useBlocks must be used inside <BlocksProvider>');
  return ctx;
}
