import {
  collection,
  count,
  doc,
  getAggregateFromServer,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  sum,
  Timestamp,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore';

import type { Message } from '@/lib/chat';
import { db } from '@/lib/firebase';

/** Firestore free plan: 1 GiB stored, for the whole project. */
export const FREE_STORAGE_BYTES = 1024 ** 3;
/** Photos / voice notes sent before media docs recorded their size: a typical one. */
const OLD_MEDIA_BYTES = 150_000;
/** A message doc with its index entries, roughly. */
const MESSAGE_BYTES = 600;

export type ChatUsage = { chatId: string; media: number; messages: number; bytes: number };

/**
 * How much one chat takes up, from aggregate queries (a few reads each, nothing
 * downloaded). Sizes of older photos are estimated.
 */
export async function chatUsage(chatId: string): Promise<ChatUsage> {
  const media = collection(db, 'chats', chatId, 'media');
  const [all, sized, messages] = await Promise.all([
    getCountFromServer(media),
    getAggregateFromServer(query(media, where('size', '>', 0)), { bytes: sum('size'), n: count() }),
    getCountFromServer(collection(db, 'chats', chatId, 'messages')),
  ]);
  const mediaCount = all.data().count;
  const known = sized.data();
  const unsized = Math.max(0, mediaCount - known.n);
  return {
    chatId,
    media: mediaCount,
    messages: messages.data().count,
    bytes: (known.bytes ?? 0) + unsized * OLD_MEDIA_BYTES + messages.data().count * MESSAGE_BYTES,
  };
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const PAGE = 200;
/** One run deletes at most this many (each delete is a write; the free plan allows 20k a day). */
const MAX_DELETES = 3000;

/**
 * Deletes the stored photos / voice notes of messages older than `days` in one chat,
 * for both people. The messages stay ("Photo unavailable"); starred ones are kept.
 * Walks the small message docs instead of the media docs, so no photo is downloaded.
 */
export async function clearOldMedia(
  chatId: string,
  days: number,
  keepMessageIds: Set<string>,
  budget = MAX_DELETES,
  onProgress?: (cleared: number) => void
) {
  const cutoff = Timestamp.fromMillis(Date.now() - days * 86_400_000);
  const messages = collection(db, 'chats', chatId, 'messages');
  let last: QueryDocumentSnapshot | null = null;
  let cleared = 0;
  while (cleared < budget) {
    const snap: QuerySnapshot = await getDocs(
      query(
        messages,
        where('createdAt', '<', cutoff),
        orderBy('createdAt'),
        ...(last ? [startAfter(last)] : []),
        limit(PAGE)
      )
    );
    const mediaIds = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Message, 'id'>) }))
      .filter((m) => (m.type === 'image' || m.type === 'audio') && m.mediaId && !keepMessageIds.has(m.id))
      .map((m) => m.mediaId!)
      .slice(0, budget - cleared);
    for (let i = 0; i < mediaIds.length; i += 100) {
      const batch = writeBatch(db);
      for (const id of mediaIds.slice(i, i + 100)) batch.delete(doc(db, 'chats', chatId, 'media', id));
      await batch.commit();
      cleared += Math.min(100, mediaIds.length - i);
      onProgress?.(cleared);
    }
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return cleared;
}
