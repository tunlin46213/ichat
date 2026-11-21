import {
  collection,
  deleteField,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { notifyRecipient } from '@/lib/notify';

export type UserProfile = {
  id: string;
  name: string;
  avatarUrl: string | null;
  lastSeen?: Timestamp | null;
  /** a short line about them (Settings → Bio) */
  bio?: string;
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
  /** When each member's app last received the chat's newest message ("Delivered" ✓✓). */
  deliveredAt?: Record<string, Timestamp | null>;
  /** When each member last read the chat (drives "Read" receipts). */
  lastRead?: Record<string, Timestamp | null>;
  /** Unread message count per member (drives the badges). */
  unread?: Record<string, number>;
  /** Time each member last typed; "typing…" shows while this is recent. */
  typing?: Record<string, Timestamp | null>;
  /** Message pinned to the top of the chat (shared by both members). */
  pinned?: PinnedRef | null;
  /** Per-user: when they pinned this chat to the top of their list. */
  pinnedAt?: Record<string, Timestamp | null>;
  /** Per-user: when they archived it (out of the main list). */
  archivedAt?: Record<string, Timestamp | null>;
  /** Messages waiting for their send time (message id → when / who / preview). */
  scheduled?: Record<string, ScheduledRef | null>;
  /** Shared countdowns shown at the top of the chat ("Trip ⛰️ — in 5 days"). */
  countdowns?: Record<string, Countdown | null>;
  /** Per-user live activity ("recording voice…", "choosing a photo…"). */
  activity?: Record<string, { kind: ActivityKind; at: Timestamp | null } | null>;
  /** Per-user live location share (updated while their app is open, until `until`). */
  live?: Record<string, LiveLocation | null>;
};

export type LiveLocation = {
  lat: number;
  lng: number;
  /** last position update */
  at: Timestamp | null;
  until: Timestamp;
  /** the "Live location" message this share belongs to */
  messageId: string;
};

export type ActivityKind = 'recording' | 'photo';

export type ScheduledRef = { at: Timestamp; senderId: string; preview: string };
export type Countdown = { title: string; emoji: string; at: Timestamp; by: string };

export const MAX_PINNED_CHATS = 5;

export type PinnedRef = { id: string; text: string; senderId: string };

export type ReplyRef = { id: string; text: string; senderId: string };

export type MessageType = 'text' | 'image' | 'audio' | 'call' | 'location';

/** What a chat message keeps about a shared moment (enough to draw its card). */
export type SharedMoment = {
  id: string;
  authorId: string;
  authorName: string;
  text?: string;
  /** first photo (loaded from momentMedia) and its tiny blurred preview */
  photoId?: string;
  thumb?: string;
  photoCount?: number;
};

export type Message = {
  id: string;
  /** missing on older messages, which are all text */
  type?: MessageType;
  text: string;
  /** tiny base64 JPEG of a photo, shown blurred until the full one loads */
  thumb?: string;
  /** photo / voice note stored in chats/{chatId}/media/{mediaId} (see lib/media.ts) */
  mediaId?: string;
  mime?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  /** voice notes: loudness per bar (0–1), recorded while speaking */
  waveform?: number[];
  /** call log entries */
  callType?: 'voice' | 'video';
  callStatus?: 'answered' | 'missed';
  /** shared location */
  lat?: number;
  lng?: number;
  /** live location: shared until then (positions live in chat.live, see LiveLocation) */
  liveUntil?: Timestamp;
  /** sent with "Forward" from another chat */
  forwarded?: boolean;
  /** a moment shared into the chat (shown as a preview card that opens it) */
  moment?: SharedMoment;
  /** sent with "Schedule": createdAt is the send time, hidden from them until then */
  scheduled?: boolean;
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
  /** local only: the server refused it or it never got out (lib/outbox.ts) */
  failed?: boolean;
};

export const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'] as const;

// The composer re-signals every 4 s while typing (fewer Firestore writes on the free plan).
const TYPING_FRESH_MS = 8000;
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
      // merge deep-merges this map. Skip a blank name (e.g. opened from a notification
      // without one) so it never overwrites the other person's real name.
      names: { [me.uid]: me.name, ...(other.name.trim() ? { [other.uid]: other.name } : {}) },
    },
    { merge: true }
  );
  return id;
}

/**
 * Adds the chat-preview update that goes with every new message to `batch`: last
 * message, time, and (unless told not to) one more unread for the recipient.
 */
export function addChatUpdate(
  batch: WriteBatch,
  chatId: string,
  senderId: string,
  recipientId: string,
  preview: string,
  { countUnread = true } = {}
) {
  batch.update(chatRef(chatId), {
    lastMessage: preview,
    lastSenderId: senderId,
    updatedAt: serverTimestamp(),
    ...(countUnread ? { [`unread.${recipientId}`]: increment(1) } : {}),
    [`lastRead.${senderId}`]: serverTimestamp(),
    [`typing.${senderId}`]: null,
  });
}

/** Adds a message and updates the chat preview + the other person's unread count atomically. */
export async function sendMessage(
  chatId: string,
  senderId: string,
  recipientId: string,
  text: string,
  replyTo?: ReplyRef | null,
  { forwarded = false, id, moment }: { forwarded?: boolean; id?: string; moment?: SharedMoment } = {}
) {
  const batch = writeBatch(db);
  // A known id (lib/outbox.ts) makes a retry overwrite rather than duplicate.
  const ref = id ? messageRef(chatId, id) : doc(collection(db, 'chats', chatId, 'messages'));
  batch.set(ref, {
    text,
    senderId,
    createdAt: serverTimestamp(),
    ...(replyTo ? { replyTo: { ...replyTo, text: replyTo.text.slice(0, 200) } } : {}),
    ...(forwarded ? { forwarded: true } : {}),
    ...(moment ? { moment } : {}),
  });
  addChatUpdate(batch, chatId, senderId, recipientId, text);
  await batch.commit();
  notifyRecipient(chatId, text);
}

/** Call log entry, written by the caller when a call ends. Missed calls count as unread. */
export async function sendCallMessage(
  chatId: string,
  senderId: string,
  recipientId: string,
  call: { video: boolean; durationMs: number; answered: boolean }
) {
  const message = {
    type: 'call' as const,
    text: '',
    senderId,
    createdAt: serverTimestamp(),
    callType: call.video ? ('video' as const) : ('voice' as const),
    callStatus: call.answered ? ('answered' as const) : ('missed' as const),
    durationMs: Math.max(0, Math.round(call.durationMs)),
  };
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'chats', chatId, 'messages')), message);
  const preview = previewFor(message);
  addChatUpdate(batch, chatId, senderId, recipientId, preview, { countUnread: !call.answered });
  await batch.commit();
  if (!call.answered) notifyRecipient(chatId, preview);
}

/** Shares a map location (opens in Apple Maps on the other side). */
export async function sendLocation(
  chatId: string,
  senderId: string,
  recipientId: string,
  coords: { lat: number; lng: number },
  { forwarded = false } = {}
) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'chats', chatId, 'messages')), {
    type: 'location',
    text: '',
    senderId,
    createdAt: serverTimestamp(),
    lat: coords.lat,
    lng: coords.lng,
    ...(forwarded ? { forwarded: true } : {}),
  });
  addChatUpdate(batch, chatId, senderId, recipientId, '📍 Location');
  await batch.commit();
  notifyRecipient(chatId, '📍 Location');
}

/**
 * Starts sharing my live location for `minutes`: a "Live location" message plus my
 * entry in chat.live, which my phone keeps updating (lib/live-location.ts).
 */
export async function sendLiveLocation(
  chatId: string,
  senderId: string,
  recipientId: string,
  coords: { lat: number; lng: number },
  minutes: number
) {
  const until = Timestamp.fromMillis(Date.now() + minutes * 60_000);
  const batch = writeBatch(db);
  const ref = doc(collection(db, 'chats', chatId, 'messages'));
  batch.set(ref, {
    type: 'location',
    text: '',
    senderId,
    createdAt: serverTimestamp(),
    lat: coords.lat,
    lng: coords.lng,
    liveUntil: until,
  });
  addChatUpdate(batch, chatId, senderId, recipientId, '📍 Live location');
  batch.update(chatRef(chatId), {
    [`live.${senderId}`]: { lat: coords.lat, lng: coords.lng, at: serverTimestamp(), until, messageId: ref.id },
  });
  await batch.commit();
  notifyRecipient(chatId, '📍 Live location');
  return until.toMillis();
}

/** New position for my running live share. */
export function updateLiveLocation(chatId: string, uid: string, coords: { lat: number; lng: number }) {
  return updateDoc(chatRef(chatId), {
    [`live.${uid}.lat`]: coords.lat,
    [`live.${uid}.lng`]: coords.lng,
    [`live.${uid}.at`]: serverTimestamp(),
  });
}

/** Ends my live share now (the last position stays visible as "ended"). */
export function stopLiveLocation(chatId: string, uid: string) {
  return updateDoc(chatRef(chatId), { [`live.${uid}.until`]: Timestamp.now() });
}

/** Their live share, if it is still running. */
export function activeLive(chat: Pick<Chat, 'live'> | null | undefined, uid: string, now: number) {
  const live = chat?.live?.[uid];
  return live && typeof live.lat === 'number' && (live.until?.toMillis() ?? 0) > now ? live : null;
}

/** Pins a message for both members, or clears the pin with null. */
export function setPinned(chatId: string, pinned: PinnedRef | null) {
  return updateDoc(chatRef(chatId), { pinned });
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** One-line description of a message for previews, replies, pins and notifications. */
export function previewFor(
  message: Pick<Message, 'type' | 'text' | 'durationMs' | 'callType' | 'callStatus' | 'liveUntil'>
) {
  switch (message.type ?? 'text') {
    case 'image':
      return '📷 Photo';
    case 'audio':
      return message.durationMs
        ? `🎤 Voice message (${formatDuration(message.durationMs)})`
        : '🎤 Voice message';
    case 'location':
      return message.liveUntil ? '📍 Live location' : '📍 Location';
    case 'call': {
      const icon = message.callType === 'video' ? '📹' : '📞';
      const kind = message.callType === 'video' ? 'Video call' : 'Voice call';
      return message.callStatus === 'missed'
        ? `${icon} Missed ${kind.toLowerCase()}`
        : `${icon} ${kind} · ${formatDuration(message.durationMs ?? 0)}`;
    }
    default:
      return message.text;
  }
}

/** A fresh id for a message that isn't written yet (outbox). */
export function newMessageId(chatId: string) {
  return doc(collection(db, 'chats', chatId, 'messages')).id;
}

/** My app has received this chat's newest message (their ✓✓ "Delivered"). */
export function markDelivered(chatId: string, myUid: string) {
  return updateDoc(chatRef(chatId), { [`deliveredAt.${myUid}`]: serverTimestamp() });
}

/** Clears my unread count and moves my read marker to now. */
export function markRead(chatId: string, myUid: string) {
  return updateDoc(chatRef(chatId), {
    [`unread.${myUid}`]: 0,
    [`lastRead.${myUid}`]: serverTimestamp(),
  });
}

/** Pins / unpins a chat at the top of my list (only affects me). */
export function setChatPinned(chatId: string, myUid: string, pinned: boolean) {
  return updateDoc(chatRef(chatId), { [`pinnedAt.${myUid}`]: pinned ? serverTimestamp() : deleteField() });
}

/** Moves a chat to / out of my archive (only affects me). */
export function setChatArchived(chatId: string, myUid: string, archived: boolean) {
  return updateDoc(chatRef(chatId), {
    [`archivedAt.${myUid}`]: archived ? serverTimestamp() : deleteField(),
    // Archiving also unpins it, like iOS Messages / Telegram.
    ...(archived ? { [`pinnedAt.${myUid}`]: deleteField() } : {}),
  });
}

/** "Mark as Unread": shows the unread dot again until I open the chat. */
export function markUnread(chatId: string, myUid: string) {
  return updateDoc(chatRef(chatId), { [`unread.${myUid}`]: 1 });
}

export function isPinnedFor(chat: Chat, uid: string) {
  return !!chat.pinnedAt?.[uid];
}

export function isArchivedFor(chat: Chat, uid: string) {
  return !!chat.archivedAt?.[uid];
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

const ACTIVITY_FRESH_MS = 20_000;

/** Shows the other person what I'm doing ("recording voice…"); null clears it. */
export function setActivity(chatId: string, myUid: string, kind: ActivityKind | null) {
  return updateDoc(chatRef(chatId), {
    [`activity.${myUid}`]: kind ? { kind, at: serverTimestamp() } : null,
  });
}

/** Their current activity, if it's recent. */
export function activityOf(chat: Pick<Chat, 'activity'> | null | undefined, uid: string): ActivityKind | null {
  const a = chat?.activity?.[uid];
  if (!a?.at) return null;
  return Date.now() - a.at.toMillis() < ACTIVITY_FRESH_MS ? a.kind : null;
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
export async function editMessage(
  chatId: string,
  messageId: string,
  text: string,
  { isLatest = false, isPinned = false } = {}
) {
  const batch = writeBatch(db);
  batch.update(messageRef(chatId, messageId), { text, editedAt: serverTimestamp() });
  if (isLatest || isPinned) {
    batch.update(chatRef(chatId), {
      ...(isLatest ? { lastMessage: text } : {}),
      // Keep the pinned bar in step with the edited text.
      ...(isPinned ? { 'pinned.text': text.slice(0, 200) } : {}),
    });
  }
  await batch.commit();
}

/**
 * "Unsend": clears the text for both people and leaves a placeholder. If it was the
 * latest message, the chat-list preview is updated too so the text doesn't linger.
 */
export async function unsendMessage(
  chatId: string,
  messageId: string,
  { isLatest = false, isPinned = false } = {}
) {
  const batch = writeBatch(db);
  batch.update(messageRef(chatId, messageId), { deleted: true, text: '', replyTo: null });
  if (isLatest || isPinned) {
    batch.update(chatRef(chatId), {
      ...(isLatest ? { lastMessage: 'Message unsent' } : {}),
      // An unsent message must not live on in the pinned bar.
      ...(isPinned ? { pinned: null } : {}),
    });
  }
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

/** Floating day label while scrolling a chat: "Today", "Yesterday", "Monday", "Mon, 12 Mar". */
export function formatDay(ts: Timestamp | null) {
  const date = ts?.toDate() ?? new Date();
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (now.getTime() - date.getTime() < 6 * 86400000) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }
  return date.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  });
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

// ── Scheduled messages ──
// The message is written right away with createdAt = send time, so it sorts into
// place. The other person's app hides it until then. Whichever member's app is open
// once the time has passed "delivers" it: chat preview, unread count, banner.

export const MAX_SCHEDULE_DAYS = 30;

export async function scheduleMessage(chatId: string, senderId: string, text: string, at: Date) {
  const batch = writeBatch(db);
  const ref = doc(collection(db, 'chats', chatId, 'messages'));
  const when = Timestamp.fromDate(at);
  batch.set(ref, { text, senderId, createdAt: when, scheduled: true });
  batch.update(chatRef(chatId), {
    [`scheduled.${ref.id}`]: { at: when, senderId, preview: text.slice(0, 200) } satisfies ScheduledRef,
  });
  await batch.commit();
}

/** Removes a scheduled message before it goes out. */
export async function cancelScheduled(chatId: string, messageId: string) {
  const batch = writeBatch(db);
  batch.delete(messageRef(chatId, messageId));
  batch.update(chatRef(chatId), { [`scheduled.${messageId}`]: deleteField() });
  await batch.commit();
}

/** True while my own scheduled message hasn't reached its time yet. */
export function isScheduledPending(message: Message, now: number) {
  return !!message.scheduled && (message.createdAt?.toMillis() ?? 0) > now;
}

/**
 * Delivers any scheduled messages in this chat whose time has come. Safe to call from
 * both phones at once: a transaction makes sure each one is delivered only once.
 */
export async function deliverDueScheduled(chat: Chat, myUid: string, now = Date.now()) {
  const due = Object.entries(chat.scheduled ?? {}).filter(([, s]) => !!s?.at && s.at.toMillis() <= now);
  for (const [id] of due) {
    const delivered = await runTransaction(db, async (tx) => {
      const snap = await tx.get(chatRef(chat.id));
      const entry = (snap.get('scheduled') as Chat['scheduled'])?.[id];
      if (!entry) return null; // already delivered (or cancelled)
      const members = (snap.get('members') as string[]) ?? [];
      const recipient = members.find((m) => m !== entry.senderId) ?? '';
      const updatedAt = snap.get('updatedAt') as Timestamp | null;
      const newer = updatedAt && updatedAt.toMillis() > entry.at.toMillis();
      tx.update(chatRef(chat.id), {
        [`scheduled.${id}`]: deleteField(),
        [`unread.${recipient}`]: increment(1),
        // Don't replace the preview with an older message.
        ...(newer ? {} : { lastMessage: entry.preview, lastSenderId: entry.senderId, updatedAt: entry.at }),
      });
      return entry;
    });
    // Alert them now, like a normal send. Only from the sender's phone: the worker
    // notifies "the other member" of whoever calls it. (If their own phone delivered
    // it, iChat is open there and shows it already.)
    if (delivered && delivered.senderId === myUid) notifyRecipient(chat.id, delivered.preview);
  }
}

// ── Countdowns ──

export function addCountdown(chatId: string, by: string, title: string, emoji: string, at: Date) {
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  return updateDoc(chatRef(chatId), {
    [`countdowns.${id}`]: { title: title.trim().slice(0, 60), emoji, at: Timestamp.fromDate(at), by } satisfies Countdown,
  });
}

export function removeCountdown(chatId: string, id: string) {
  return updateDoc(chatRef(chatId), { [`countdowns.${id}`]: deleteField() });
}

/** Whole days from today to `at` (calendar days, local time). */
export function daysUntil(at: Timestamp, now: number) {
  const a = at.toDate();
  const b = new Date(now);
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(a) - day(b)) / 86_400_000);
}

/** "Today 🎉", "Tomorrow", "in 5 days", "in 3 months". */
export function formatCountdown(days: number) {
  if (days === 0) return 'Today 🎉';
  if (days === 1) return 'Tomorrow';
  if (days < 0) return days === -1 ? 'Yesterday' : `${-days} days ago`;
  if (days < 60) return `in ${days} days`;
  return `in ${Math.round(days / 30)} months`;
}

/** Countdowns not more than a day past, soonest first. */
export function upcomingCountdowns(chat: Pick<Chat, 'countdowns'> | null | undefined, now: number) {
  return Object.entries(chat?.countdowns ?? {})
    .filter((e): e is [string, Countdown] => !!e[1]?.at)
    .map(([id, c]) => ({ id, ...c, days: daysUntil(c.at, now) }))
    .filter((c) => c.days >= -1)
    // Upcoming ones first (soonest on top); yesterday's comes last instead of hiding them.
    .sort((a, b) => (a.days < 0 ? 1 : 0) - (b.days < 0 ? 1 : 0) || a.at.toMillis() - b.at.toMillis());
}
