import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import type { PickedImage } from '@/lib/media';

/*
 * 24-hour stories. Metadata lives in stories/{id} (small, listened to live); the photo
 * itself is in storyMedia/{id} (base64, loaded only when viewed), like chat media.
 * There are no Cloud Functions on the free plan, so expired stories are hidden by the
 * app and each owner's phone deletes its own old ones when the app starts.
 */

export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
export const STORY_SECONDS = 5;

/** Backgrounds for text stories. */
export const STORY_BACKGROUNDS = [
  { id: 'ocean', css: 'linear-gradient(160deg, #208AEF 0%, #8E4EC6 100%)' },
  { id: 'sunset', css: 'linear-gradient(160deg, #FF8A3D 0%, #E5484D 55%, #D6409F 100%)' },
  { id: 'mint', css: 'linear-gradient(160deg, #12A594 0%, #30A46C 100%)' },
  { id: 'night', css: 'linear-gradient(160deg, #1B2D52 0%, #34184A 60%, #0D0716 100%)' },
  { id: 'peach', css: 'linear-gradient(160deg, #FFB86B 0%, #FF6CAB 100%)' },
  { id: 'graphite', css: 'linear-gradient(160deg, #5B5F66 0%, #1C1C1E 100%)' },
] as const;

export type StoryBackgroundId = (typeof STORY_BACKGROUNDS)[number]['id'];

export type Story = {
  id: string;
  ownerId: string;
  kind: 'photo' | 'text';
  /** photo caption, or the text of a text story */
  text?: string;
  background?: StoryBackgroundId;
  width?: number;
  height?: number;
  createdAt: Timestamp | null;
  expiresAt: Timestamp;
  /** uid → when they first saw it */
  viewers?: Record<string, Timestamp>;
  /** uid → their emoji reaction */
  reactions?: Record<string, string>;
};

export function backgroundCss(id: StoryBackgroundId | undefined) {
  return (STORY_BACKGROUNDS.find((b) => b.id === id) ?? STORY_BACKGROUNDS[0]).css;
}

export function isExpired(story: Story, now = Date.now()) {
  return story.expiresAt.toMillis() <= now;
}

export function seenBy(story: Story, uid: string) {
  return !!story.viewers?.[uid];
}

/** Live query for stories that haven't expired yet (filter again on the device). */
export function activeStoriesQuery() {
  return query(collection(db, 'stories'), where('expiresAt', '>', Timestamp.now()));
}

// ── Draft hand-off: the picked photo is too big for route params. ──
let draft: PickedImage | null = null;
export function setStoryDraft(image: PickedImage | null) {
  draft = image;
}
export function takeStoryDraft() {
  return draft;
}

export async function postPhotoStory(uid: string, image: PickedImage, caption: string) {
  const batch = writeBatch(db);
  const ref = doc(collection(db, 'stories'));
  batch.set(doc(db, 'storyMedia', ref.id), {
    ownerId: uid,
    data: image.base64,
    mime: 'image/jpeg',
  });
  batch.set(ref, {
    ownerId: uid,
    kind: 'photo',
    ...(caption.trim() ? { text: caption.trim().slice(0, 300) } : {}),
    width: image.width,
    height: image.height,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + STORY_TTL_MS),
  });
  await batch.commit();
}

export async function postTextStory(uid: string, text: string, background: StoryBackgroundId) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'stories')), {
    ownerId: uid,
    kind: 'text',
    text: text.trim().slice(0, 300),
    background,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + STORY_TTL_MS),
  });
  await batch.commit();
}

/** Sets my emoji on a story, or removes it with null. */
export function reactToStory(storyId: string, uid: string, emoji: string | null) {
  return updateDoc(doc(db, 'stories', storyId), {
    [`reactions.${uid}`]: emoji ?? deleteField(),
    [`viewers.${uid}`]: serverTimestamp(),
  });
}

/** "❤️ 2 · 😂 1": reactions grouped by emoji, most used first. */
export function reactionSummary(story: Story) {
  const counts = new Map<string, number>();
  for (const emoji of Object.values(story.reactions ?? {})) counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function markStoryViewed(storyId: string, uid: string) {
  return updateDoc(doc(db, 'stories', storyId), { [`viewers.${uid}`]: serverTimestamp() });
}

export async function deleteStory(story: Story) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'stories', story.id));
  if (story.kind === 'photo') batch.delete(doc(db, 'storyMedia', story.id));
  await batch.commit();
}

/** Deletes my own expired stories (and their photos). Runs once at start-up. */
export async function cleanUpMyStories(uid: string) {
  const snap = await getDocs(query(collection(db, 'stories'), where('ownerId', '==', uid)));
  const now = Date.now();
  const old = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Story)
    .filter((s) => s.expiresAt && isExpired(s, now));
  if (!old.length) return;
  const batch = writeBatch(db);
  for (const story of old.slice(0, 200)) {
    batch.delete(doc(db, 'stories', story.id));
    if (story.kind === 'photo') batch.delete(doc(db, 'storyMedia', story.id));
  }
  await batch.commit();
}

// Photos never change, so keep them for the session.
const photoCache = new Map<string, Promise<string>>();

/** data: URI of a story photo. */
export function loadStoryPhoto(storyId: string) {
  let pending = photoCache.get(storyId);
  if (!pending) {
    pending = getDoc(doc(db, 'storyMedia', storyId)).then((snap) => {
      const data = snap.get('data') as string | undefined;
      if (!data) throw new Error('story/missing');
      return `data:image/jpeg;base64,${data}`;
    });
    pending.catch(() => photoCache.delete(storyId));
    photoCache.set(storyId, pending);
  }
  return pending;
}
