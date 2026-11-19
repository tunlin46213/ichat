import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';

import type { Message } from '@/lib/chat';
import { db } from '@/lib/firebase';

/** How far back to look for "On this day", furthest first. */
const OFFSETS: { label: string; years?: number; months?: number }[] = [
  ...[5, 4, 3, 2].map((years) => ({ label: `${years} years ago today`, years })),
  { label: '1 year ago today', years: 1 },
  { label: '6 months ago today', months: 6 },
  { label: '3 months ago today', months: 3 },
  { label: '1 month ago today', months: 1 },
];

const KINDS = new Set(['text', 'image', 'audio', 'location']);
const STORE_KEY = 'ichat.memories.v1';

export type Memory = { label: string; day: Date; messages: Message[] };

type Checked = { date: string; offset: number | null; dismissed?: boolean };

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function readStore(): Promise<Record<string, Checked>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(STORE_KEY)) ?? '{}');
  } catch {
    return {};
  }
}

async function writeStore(chatId: string, value: Checked) {
  const store = await readStore();
  // Drop other chats' entries from earlier days.
  for (const key of Object.keys(store)) if (store[key].date !== value.date) delete store[key];
  store[chatId] = value;
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(store)).catch(() => {});
}

/** The same calendar day `offset` back, or null when it doesn't exist (31 Mar → 31 Feb). */
function dayBack(now: Date, offset: (typeof OFFSETS)[number]) {
  const d = new Date(now.getFullYear() - (offset.years ?? 0), now.getMonth() - (offset.months ?? 0), now.getDate());
  return d.getDate() === now.getDate() ? d : null;
}

async function loadDay(chatId: string, day: Date, hiddenBefore: number) {
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  const snap = await getDocs(
    query(
      collection(db, 'chats', chatId, 'messages'),
      where('createdAt', '>=', Timestamp.fromDate(day)),
      where('createdAt', '<', Timestamp.fromDate(end)),
      orderBy('createdAt'),
      limit(60)
    )
  );
  // Offline, Firestore answers from its partial local cache: don't remember "nothing".
  if (snap.metadata.fromCache) throw new Error('memories/offline');
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Message)
    .filter(
      (m) => !m.deleted && KINDS.has(m.type ?? 'text') && (m.createdAt?.toMillis() ?? 0) > hiddenBefore
    );
}

/** Worth showing: a photo, or a bit of conversation. */
function worthIt(messages: Message[]) {
  return messages.some((m) => m.type === 'image') || messages.length >= 3;
}

/**
 * "On this day" for a chat: the furthest-back day (1 month … 5 years ago) with photos or
 * a real conversation. Looked up once per chat per day; the answer is remembered.
 */
export async function findMemory(chatId: string, hiddenBefore: number): Promise<Memory | null> {
  const now = new Date();
  const today = dayKey(now);
  const saved = (await readStore())[chatId];
  if (saved?.date === today && (saved.dismissed || saved.offset === null)) return null;

  const order = saved?.date === today && saved.offset !== null ? [saved.offset] : OFFSETS.map((_, i) => i);
  for (const i of order) {
    const day = dayBack(now, OFFSETS[i]);
    if (!day) continue;
    const messages = await loadDay(chatId, day, hiddenBefore);
    if (worthIt(messages)) {
      await writeStore(chatId, { date: today, offset: i });
      return { label: OFFSETS[i].label, day, messages };
    }
  }
  await writeStore(chatId, { date: today, offset: null });
  return null;
}

/** Hide today's memory for this chat. */
export function dismissMemory(chatId: string) {
  return writeStore(chatId, { date: dayKey(new Date()), offset: null, dismissed: true });
}
