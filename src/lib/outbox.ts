import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDocFromServer, Timestamp } from 'firebase/firestore';
import { useSyncExternalStore } from 'react';

import { newMessageId, sendMessage, type Message, type ReplyRef } from '@/lib/chat';
import { db } from '@/lib/firebase';

/**
 * Text messages on their way out. Firestore queues writes while offline, but the queue
 * lives in memory: if iChat is closed before the server confirms, the message is lost
 * without an error. And a refused write (blocked, quota) only shows up as a rejected
 * promise. The outbox remembers every send until the server confirms it, so either case
 * becomes a "Not delivered — Retry" bubble instead of a silently missing message.
 */
export type OutboxItem = {
  /** the Firestore message id it was (or will be) written under */
  id: string;
  chatId: string;
  senderId: string;
  recipientId: string;
  text: string;
  replyTo: ReplyRef | null;
  at: number;
  state: 'sending' | 'failed';
  reason?: string;
};

const STORE_KEY = 'ichat.outbox.v1';
let items: OutboxItem[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit(next: OutboxItem[]) {
  items = next;
  listeners.forEach((l) => l());
  AsyncStorage.setItem(STORE_KEY, JSON.stringify(items)).catch(() => {});
}

const ready = AsyncStorage.getItem(STORE_KEY)
  .then((saved) => {
    const restored = saved ? (JSON.parse(saved) as OutboxItem[]) : [];
    // Anything added since start-up wins over the saved copy of the same id.
    const ids = new Set(items.map((i) => i.id));
    items = [...items, ...restored.filter((i) => !ids.has(i.id))];
    loaded = true;
    listeners.forEach((l) => l());
  })
  .catch(() => {
    loaded = true;
  });

function update(id: string, patch: Partial<OutboxItem> | null) {
  emit(patch === null ? items.filter((i) => i.id !== id) : items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
}

function reasonOf(err: unknown) {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'permission-denied') return 'They may not be accepting messages.';
  if (code === 'resource-exhausted') return 'The free daily limit is used up. Try again tomorrow.';
  return 'Not delivered.';
}

/** Ids sent during this run: their promises are alive, so verifyLeftovers leaves them alone. */
const inFlight = new Set<string>();

function deliver(item: OutboxItem) {
  inFlight.add(item.id);
  sendMessage(item.chatId, item.senderId, item.recipientId, item.text, item.replyTo, { id: item.id })
    .then(
      () => update(item.id, null),
      (err) => update(item.id, { state: 'failed', reason: reasonOf(err) })
    )
    .finally(() => inFlight.delete(item.id));
}

/** Sends a text message through the outbox. Returns at once; Firestore shows it right away. */
export function sendText(chatId: string, senderId: string, recipientId: string, text: string, replyTo: ReplyRef | null) {
  const item: OutboxItem = {
    id: newMessageId(chatId),
    chatId,
    senderId,
    recipientId,
    text,
    replyTo,
    at: Date.now(),
    state: 'sending',
  };
  emit([...items, item]);
  deliver(item);
  return item.id;
}

export function retry(id: string) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const again = { ...item, state: 'sending' as const, reason: undefined, at: Date.now() };
  update(id, again);
  deliver(again);
}

export function discard(id: string) {
  update(id, null);
}

/**
 * After a restart, "sending" items from the last run have no promise any more. Ask the
 * server whether each one arrived: if so forget it, otherwise show it as not delivered.
 */
export async function verifyLeftovers(chatId: string) {
  await ready;
  const stale = items.filter((i) => i.chatId === chatId && i.state === 'sending' && !inFlight.has(i.id));
  for (const item of stale) {
    try {
      const snap = await getDocFromServer(doc(db, 'chats', chatId, 'messages', item.id));
      if (snap.exists()) update(item.id, null);
      else update(item.id, { state: 'failed', reason: 'Not delivered.' });
    } catch {
      // Offline: check again next time.
    }
  }
}

/** This chat's undelivered messages, as bubbles (newest first, like the message list). */
export function useFailedMessages(chatId: string): Message[] {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => items
  );
  if (!loaded) return [];
  return snapshot
    .filter((i) => i.chatId === chatId && i.state === 'failed')
    .sort((a, b) => b.at - a.at)
    .map((i) => ({
      id: i.id,
      type: 'text',
      text: i.text,
      senderId: i.senderId,
      createdAt: Timestamp.fromMillis(i.at),
      replyTo: i.replyTo,
      failed: true,
    }));
}

export function failedReason(id: string) {
  return items.find((i) => i.id === id)?.reason ?? 'Not delivered.';
}
