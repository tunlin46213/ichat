import {
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { previewFor, type Message } from '@/lib/chat';
import { db } from '@/lib/firebase';

/*
 * Starred messages are private to me, so they live in users/{uid}/private/starred
 * (the rules already let only the owner read/write `private/*`). One map field per
 * message, keyed by chat + message id.
 */

export type StarredItem = {
  chatId: string;
  messageId: string;
  otherId: string;
  otherName: string;
  senderId: string;
  preview: string;
  starredAt: Timestamp | null;
};

const starredDoc = (uid: string) => doc(db, 'users', uid, 'private', 'starred');
const keyFor = (chatId: string, messageId: string) => `${chatId}__${messageId}`;

/** All my starred messages, newest star first. null while loading. */
export function useStarred(uid: string | undefined) {
  const [items, setItems] = useState<StarredItem[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      starredDoc(uid),
      (snap) => {
        const map = (snap.data({ serverTimestamps: 'estimate' })?.items ?? {}) as Record<
          string,
          StarredItem
        >;
        setItems(
          Object.values(map).sort(
            (a, b) => (b.starredAt?.toMillis() ?? 0) - (a.starredAt?.toMillis() ?? 0)
          )
        );
      },
      () => setItems([])
    );
  }, [uid]);
  return items;
}

export function isStarred(items: StarredItem[] | null, chatId: string, messageId: string) {
  return !!items?.some((i) => i.chatId === chatId && i.messageId === messageId);
}

export function starMessage(
  uid: string,
  chatId: string,
  message: Message,
  other: { id: string; name: string }
) {
  return setDoc(
    starredDoc(uid),
    {
      items: {
        [keyFor(chatId, message.id)]: {
          chatId,
          messageId: message.id,
          otherId: other.id,
          otherName: other.name,
          senderId: message.senderId,
          preview: previewFor(message).slice(0, 300),
          starredAt: serverTimestamp(),
        },
      },
    },
    { merge: true }
  );
}

export function unstarMessage(uid: string, chatId: string, messageId: string) {
  return setDoc(
    starredDoc(uid),
    { items: { [keyFor(chatId, messageId)]: deleteField() } },
    { merge: true }
  );
}
