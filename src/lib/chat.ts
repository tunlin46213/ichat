import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

export type UserProfile = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type Chat = {
  id: string;
  members: string[];
  names: Record<string, string>;
  lastMessage: string | null;
  lastSenderId: string | null;
  updatedAt: Timestamp | null;
  /** Per-user "deleted at" time. Hides the chat (and older messages) for that user only. */
  hiddenAt?: Record<string, Timestamp | null>;
};

export type Message = {
  id: string;
  text: string;
  senderId: string;
  createdAt: Timestamp | null;
  /** true until the server has saved it (local, optimistic copy) */
  pending?: boolean;
};

/** 1:1 chat id: both user ids sorted and joined, so a pair always maps to one chat. */
export function chatIdFor(uidA: string, uidB: string) {
  return [uidA, uidB].sort().join('_');
}

/**
 * Creates the chat document if it does not exist yet (merge keeps lastMessage etc.).
 * Must run before reading messages: the security rules check chat membership.
 */
export async function ensureChat(
  me: { uid: string; name: string },
  other: { uid: string; name: string }
) {
  const id = chatIdFor(me.uid, other.uid);
  await setDoc(
    doc(db, 'chats', id),
    {
      members: [me.uid, other.uid].sort(),
      names: { [me.uid]: me.name, [other.uid]: other.name },
    },
    { merge: true }
  );
  return id;
}

/** Adds a message and updates the chat preview in one atomic write. */
export async function sendMessage(chatId: string, senderId: string, text: string) {
  const batch = writeBatch(db);
  const messageRef = doc(collection(db, 'chats', chatId, 'messages'));
  batch.set(messageRef, { text, senderId, createdAt: serverTimestamp() });
  batch.update(doc(db, 'chats', chatId), {
    lastMessage: text,
    lastSenderId: senderId,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

/**
 * "Delete conversation" for me only: the other person keeps their copy. The chat comes
 * back in my list when a new message arrives, showing only messages after this point.
 */
export async function hideChatForMe(chatId: string, myUid: string) {
  await updateDoc(doc(db, 'chats', chatId), {
    [`hiddenAt.${myUid}`]: serverTimestamp(),
  });
}

/** Visible unless I deleted it and nothing new has arrived since. */
export function isChatVisibleTo(chat: Chat, myUid: string) {
  if (chat.lastMessage == null) return false;
  const hidden = chat.hiddenAt?.[myUid];
  if (!hidden) return true;
  return (chat.updatedAt?.toMillis() ?? 0) > hidden.toMillis();
}

export function otherMemberId(chat: Pick<Chat, 'members'>, myUid: string) {
  return chat.members.find((m) => m !== myUid) ?? myUid;
}

/** "14:05" for today, "Mon" within a week, otherwise "12/3/26". */
export function formatChatTime(ts: Timestamp | null) {
  if (!ts) return '';
  const date = ts.toDate();
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const sixDays = 6 * 24 * 60 * 60 * 1000;
  if (now.getTime() - date.getTime() < sixDays) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'numeric', year: '2-digit' });
}

export function isSameDay(a: Timestamp | null, b: Timestamp | null) {
  if (!a || !b) return true;
  return a.toDate().toDateString() === b.toDate().toDateString();
}

/** Date separator text in a chat: "Today", "Yesterday", "Monday", or "12 Mar 2026". */
export function formatDayLabel(ts: Timestamp | null) {
  if (!ts) return 'Today';
  const date = ts.toDate();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const sixDays = 6 * 24 * 60 * 60 * 1000;
  if (today.getTime() - date.getTime() < sixDays) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatMessageTime(ts: Timestamp | null) {
  if (!ts) return '';
  return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
