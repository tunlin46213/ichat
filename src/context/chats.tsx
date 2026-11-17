import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/context/auth';
import { isChatVisibleTo, unreadFor, type Chat } from '@/lib/chat';
import { db } from '@/lib/firebase';
import { setAppBadge } from '@/lib/push';

type ChatsContextValue = {
  /** null while loading */
  chats: Chat[] | null;
  error: string | null;
  /** sum of unread messages across chats (tab badge) */
  totalUnread: number;
};

const ChatsContext = createContext<ChatsContextValue | null>(null);

/** One live subscription to my chats, shared by the chat list and the tab badge. */
export function ChatsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const myUid = user?.uid;
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!myUid) return;
    // Sorted on the client so Firestore doesn't need a composite index.
    const q = query(collection(db, 'chats'), where('members', 'array-contains', myUid));
    return onSnapshot(
      q,
      (snap) => {
        setChats(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Chat)
            .filter((c) => isChatVisibleTo(c, myUid))
            .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0))
        );
        setError(null);
      },
      (err) => setError(`Could not load chats (${err.code}).`)
    );
  }, [myUid]);

  const totalUnread = myUid ? (chats ?? []).reduce((sum, c) => sum + unreadFor(c, myUid), 0) : 0;

  // Keep the app-icon badge in sync with what the user has actually read.
  useEffect(() => {
    if (chats) setAppBadge(totalUnread);
  }, [chats, totalUnread]);

  return <ChatsContext value={{ chats, error, totalUnread }}>{children}</ChatsContext>;
}

export function useChats() {
  const ctx = use(ChatsContext);
  if (!ctx) throw new Error('useChats must be used inside <ChatsProvider>');
  return ctx;
}
