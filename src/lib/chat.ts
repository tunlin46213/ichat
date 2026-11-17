import {
  collection,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  type Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { notifyRecipient } from '@/lib/notify';

export type UserProfile = {
  id: string;
  name: string;
  avatarUrl: string | null;
  lastSeen?: Timestamp | null;
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
  /** When each member last read the chat (drives "Read" receipts). */
  lastRead?: Record<string, Timestamp | null>;
  /** Unread message count per member (drives the badges). */
  unread?: Record<string, number>;
  /** Time each member last typed; "typing…" shows while this is recent. */
  typing?: Record<string, Timestamp | null>;
};

export type ReplyRef = { id: string; text: string; senderId: string };

export type MessageType = 'text' | 'image' | 'audio';

export type Message = {
  id: string;
  /** missing on older messages, which are all text */
  type?: MessageType;
  text: string;
  /** photo / voice note stored in chats/{chatId}/media/{mediaId} (see lib/media.ts) */
  mediaId?: string;
  mime?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  editedAt?: Timestamp | null;
  senderId: string;
  createdAt: Timestamp | null;
  replyTo?: ReplyRef | null;
  /** userId → emoji */
  reactions?: Record<string, string>;
  /** sender unsent it; text is cleared */
  deleted?: boolean;
  /** true until the server has saved it (local, optimistic copy) */
  pending?: boolean;
};

export const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'] as const;

const TYPING_FRESH_MS = 6000;
const GROUP_GAP_MS = 15 * 60 * 1000;

/** 1:1 chat id: both user ids sorted and joined, so a pair always maps to one chat. */
export function chatIdFor(uidA: string, uidB: string) {
  return [uidA, uidB].sort().join('_');
}

const chatRef = (chatId: string) => doc(db, 'chats', chatId);
const messageRef = (chatId: string, id: string) => doc(db, 'chats', chatId, 'messages', id);

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
    chatRef(id),
    {
      members: [me.uid, other.uid].sort(),
      names: { [me.uid]: me.name, [other.uid]: other.name },
    },
    { merge: true }
  );
  return id;
}

/** Adds a message and updates the chat preview + the other person's unread count atomically. */
export async function sendMessage(
  chatId: string,
  senderId: string,
  recipientId: string,
  text: string,
  replyTo?: ReplyRef | null
) {
  const batch = writeBatch(db);
  const ref = doc(collection(db, 'chats', chatId, 'messages'));
  batch.set(ref, {
    text,
    senderId,
    createdAt: serverTimestamp(),
    ...(replyTo ? { replyTo: { ...replyTo, text: replyTo.text.slice(0, 200) } } : {}),
  });
  batch.update(chatRef(chatId), {
    lastMessage: text,
    lastSenderId: senderId,
    updatedAt: serverTimestamp(),
    [`unread.${recipientId}`]: increment(1),
    [`lastRead.${senderId}`]: serverTimestamp(),
    [`typing.${senderId}`]: null,
  });
  await batch.commit();
  notifyRecipient(chatId, text);
}

/** Clears my unread count and moves my read marker to now. */
export function markRead(chatId: string, myUid: string) {
  return updateDoc(chatRef(chatId), {
    [`unread.${myUid}`]: 0,
    [`lastRead.${myUid}`]: serverTimestamp(),
  });
}

/** Pass true while typing (call at most every few seconds), false when done. */
export function setTyping(chatId: string, myUid: string, typing: boolean) {
  return updateDoc(chatRef(chatId), {
    [`typing.${myUid}`]: typing ? serverTimestamp() : null,
  });
}

export function isTyping(chat: Pick<Chat, 'typing'> | null | undefined, uid: string) {
  const at = chat?.typing?.[uid];
  return !!at && Date.now() - at.toMillis() < TYPING_FRESH_MS;
}

/** Sets my reaction, or removes it when I pick the same emoji again. */
export function toggleReaction(chatId: string, message: Message, myUid: string, emoji: string) {
  const reactions = { ...(message.reactions ?? {}) };
  if (reactions[myUid] === emoji) delete reactions[myUid];
  else reactions[myUid] = emoji;
  return updateDoc(messageRef(chatId, message.id), { reactions });
}

/** How long after sending a message can still be edited (like iMessage). */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export function canEdit(message: Message, myUid: string) {
  const sentAt = message.createdAt?.toMillis() ?? 0;
  return (
    message.senderId === myUid &&
    !message.deleted &&
    (message.type ?? 'text') === 'text' &&
    Date.now() - sentAt < EDIT_WINDOW_MS
  );
}

/** Edits my message's text and marks it "Edited". Updates the chat preview if it's the latest. */
export async function editMessage(chatId: string, messageId: string, text: string, isLatest: boolean) {
  const batch = writeBatch(db);
  batch.update(messageRef(chatId, messageId), { text, editedAt: serverTimestamp() });
  if (isLatest) batch.update(chatRef(chatId), { lastMessage: text });
  await batch.commit();
}

/**
 * "Unsend": clears the text for both people and leaves a placeholder. If it was the
 * latest message, the chat-list preview is updated too so the text doesn't linger.
 */
export async function unsendMessage(chatId: string, messageId: string, isLatest: boolean) {
  const batch = writeBatch(db);
  batch.update(messageRef(chatId, messageId), { deleted: true, text: '', replyTo: null });
  if (isLatest) batch.update(chatRef(chatId), { lastMessage: 'Message unsent' });
  await batch.commit();
}

/**
 * "Delete conversation" for me only: the other person keeps their copy. The chat comes
 * back in my list when a new message arrives, showing only messages after this point.
 */
export async function hideChatForMe(chatId: string, myUid: string) {
  await updateDoc(chatRef(chatId), {
    [`hiddenAt.${myUid}`]: serverTimestamp(),
    [`unread.${myUid}`]: 0,
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

export function unreadFor(chat: Chat, myUid: string) {
  return Math.max(0, chat.unread?.[myUid] ?? 0);
}

// ─── Formatting ────────────────────────────────────────────────────────────

const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Chat list: "3:05 PM" today, "Yesterday", "Monday" within a week, else "12/3/26". */
export function formatChatTime(ts: Timestamp | null) {
  if (!ts) return '';
  const date = ts.toDate();
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return time(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (now.getTime() - date.getTime() < 6 * 86400000) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'numeric', year: '2-digit' });
}

/** Separator in a chat, iMessage style: "Today 3:52 PM", "Yesterday 9:10 AM", "Mon, 12 Mar 3:00 PM". */
export function formatSeparator(ts: Timestamp | null) {
  const date = ts?.toDate() ?? new Date();
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return `Today ${time(date)}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time(date)}`;
  if (now.getTime() - date.getTime() < 6 * 86400000) {
    return `${date.toLocaleDateString([], { weekday: 'long' })} ${time(date)}`;
  }
  return `${date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${time(date)}`;
}

/** A time separator goes above a message on a new day or after a 15-minute gap. */
export function needsSeparator(older: Message | undefined, current: Message) {
  if (!older) return true;
  const a = older.createdAt?.toMillis() ?? Date.now();
  const b = current.createdAt?.toMillis() ?? Date.now();
  const sameDay = new Date(a).toDateString() === new Date(b).toDateString();
  return !sameDay || b - a > GROUP_GAP_MS;
}

export function formatMessageTime(ts: Timestamp | null) {
  return ts ? time(ts.toDate()) : '';
}

/** "Active now", "Active 5m ago", "Active 3h ago", "Last seen Monday". */
export function formatPresence(lastSeen: Timestamp | null | undefined) {
  if (!lastSeen) return '';
  const diff = Date.now() - lastSeen.toMillis();
  if (diff < 2 * 60000) return 'Active now';
  if (diff < 60 * 60000) return `Active ${Math.floor(diff / 60000)}m ago`;
  if (diff < 24 * 3600000) return `Active ${Math.floor(diff / 3600000)}h ago`;
  return `Last seen ${formatChatTime(lastSeen)}`;
}

export function isOnline(lastSeen: Timestamp | null | undefined) {
  return !!lastSeen && Date.now() - lastSeen.toMillis() < 2 * 60000;
}

