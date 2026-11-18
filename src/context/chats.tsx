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
  /** Called for each message that arrives from someone else after start-up. */
  onIncoming: (listener: (chat: Chat) => void) => () => void;
};

type IncomingListener = (chat: Chat) => void;
const incomingListeners = new Set<IncomingListener>();
function onIncoming(listener: IncomingListener) {
  incomingListeners.add(listener);
  return () => {
    incomingListeners.delete(listener);
  };
}

const ChatsContext = createContext<ChatsContextValue | null>(null);

/** One live subscription to my chats, shared by the chat list and the tab badge. */
export function ChatsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const myUid = user?.uid;
  // Tagged with the uid they belong to, so another account never sees them after
  // logout → login (this provider now lives in the root layout and isn't remounted).
  const [state, setState] = useState<{ uid: string; chats: Chat[] | null; error: string | null } | null>(
    null
  );
  const chats = state && state.uid === myUid ? state.chats : null;
  const error = state && state.uid === myUid ? state.error : null;

  useEffect(() => {
    if (!myUid) return;
    // Sorted on the client so Firestore doesn't need a composite index.
    const q = query(collection(db, 'chats'), where('members', 'array-contains', myUid));
    // Last message time per chat, to tell a new message apart from typing/read updates.
    const lastSeenAt = new Map<string, number>();
    let initial = true;
    return onSnapshot(
      q,
      (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type === 'removed') continue;
          const chat = { id: change.doc.id, ...change.doc.data({ serverTimestamps: 'estimate' }) } as Chat;
          const at = chat.updatedAt?.toMillis() ?? 0;
          const before = lastSeenAt.get(chat.id);
          lastSeenAt.set(chat.id, at);
          if (initial || change.doc.metadata.hasPendingWrites) continue;
          if (before !== undefined && at <= before) continue;
          if (!chat.lastSenderId || chat.lastSenderId === myUid || chat.lastMessage == null) continue;
          incomingListeners.forEach((listener) => listener(chat));
        }
        initial = false;
        setState({
          uid: myUid,
          chats: snap.docs
            .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Chat)
            .filter((c) => isChatVisibleTo(c, myUid))
            .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0)),
          error: null,
        });
      },
      (err) =>
        setState((prev) => ({
          uid: myUid,
          chats: prev?.uid === myUid ? prev.chats : null,
          error: `Could not load chats (${err.code}).`,
        }))
    );
  }, [myUid]);

  const totalUnread = myUid ? (chats ?? []).reduce((sum, c) => sum + unreadFor(c, myUid), 0) : 0;

  // Keep the app-icon badge in sync with what the user has actually read.
  useEffect(() => {
    if (chats) setAppBadge(totalUnread);
  }, [chats, totalUnread]);

  return (
    <ChatsContext value={{ chats, error, totalUnread, onIncoming }}>{children}</ChatsContext>
  );
}

export function useChats() {
  const ctx = use(ChatsContext);
  if (!ctx) throw new Error('useChats must be used inside <ChatsProvider>');
  return ctx;
}
