import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase';
import type { PickedImage } from '@/lib/media';
import { post } from '@/lib/notify';

/*
 * Moments: a feed of posts (text + up to 9 photos) that stay, with likes and comments.
 *   moments/{id}                 authorId, text, photos[{id, width, height, thumb}],
 *                                likes{uid: ts}, commentCount, createdAt
 *   moments/{id}/comments/{id}   authorId, text, createdAt
 *   momentMedia/{photoId}        ownerId, data (base64 JPEG ≤ 1080 px), mime
 * Photos live in their own docs (like chat media) so the feed stays light; each one is
 * loaded only when its card is on screen.
 */

export const MAX_MOMENT_PHOTOS = 9;
export const MAX_MOMENT_TEXT = 1000;
export const MAX_COMMENT_TEXT = 500;

export type MomentPhoto = { id: string; width: number; height: number; thumb?: string };

export type Moment = {
  id: string;
  authorId: string;
  text?: string;
  photos?: MomentPhoto[];
  likes?: Record<string, Timestamp | null>;
  commentCount?: number;
  createdAt: Timestamp | null;
};

/** The comment a reply answers (name kept so it shows even if that comment is deleted). */
export type CommentReplyTo = { id: string; authorId: string; name: string };

export type MomentComment = {
  id: string;
  authorId: string;
  text: string;
  replyTo?: CommentReplyTo;
  createdAt: Timestamp | null;
};

const momentRef = (id: string) => doc(db, 'moments', id);

export async function postMoment(uid: string, text: string, photos: PickedImage[]) {
  const batch = writeBatch(db);
  const ref = doc(collection(db, 'moments'));
  const stored: MomentPhoto[] = photos.slice(0, MAX_MOMENT_PHOTOS).map((p) => {
    const media = doc(collection(db, 'momentMedia'));
    batch.set(media, { ownerId: uid, data: p.base64, mime: 'image/jpeg' });
    return { id: media.id, width: p.width, height: p.height, ...(p.thumb ? { thumb: p.thumb } : {}) };
  });
  batch.set(ref, {
    authorId: uid,
    ...(text.trim() ? { text: text.trim().slice(0, MAX_MOMENT_TEXT) } : {}),
    photos: stored,
    commentCount: 0,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return ref.id;
}

export async function deleteMoment(moment: Moment) {
  // Comments first (rules let the author delete them while the moment still exists).
  const comments = await getDocs(collection(db, 'moments', moment.id, 'comments'));
  const batch = writeBatch(db);
  for (const c of comments.docs.slice(0, 400)) batch.delete(c.ref);
  for (const p of moment.photos ?? []) batch.delete(doc(db, 'momentMedia', p.id));
  batch.delete(momentRef(moment.id));
  await batch.commit();
}

export function isLiked(moment: Moment, uid: string) {
  return !!moment.likes?.[uid];
}

export async function toggleLike(moment: Moment, uid: string) {
  const liked = isLiked(moment, uid);
  await updateDoc(momentRef(moment.id), { [`likes.${uid}`]: liked ? deleteField() : serverTimestamp() });
  if (!liked && moment.authorId !== uid) notifyMomentActivity(moment.id, 'like');
}

export async function addComment(momentId: string, authorId: string, text: string, replyTo?: CommentReplyTo) {
  const clean = text.trim().slice(0, MAX_COMMENT_TEXT);
  if (!clean) return;
  // Comment and counter together, so the count never drifts from the comments.
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'moments', momentId, 'comments')), {
    authorId,
    text: clean,
    ...(replyTo ? { replyTo: { id: replyTo.id, authorId: replyTo.authorId, name: replyTo.name.slice(0, 60) } } : {}),
    createdAt: serverTimestamp(),
  });
  batch.update(momentRef(momentId), { commentCount: increment(1) });
  await batch.commit();
  notifyMomentActivity(momentId, 'comment', clean, replyTo?.id);
}

export async function deleteComment(momentId: string, commentId: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'moments', momentId, 'comments', commentId));
  batch.update(momentRef(momentId), { commentCount: increment(-1) });
  await batch.commit();
}

/** Account deletion: remove my moments (with their photos and comments). */
export async function deleteMyMoments(uid: string) {
  const mine = await getDocs(query(collection(db, 'moments'), where('authorId', '==', uid), limit(200)));
  for (const d of mine.docs) await deleteMoment({ id: d.id, ...d.data() } as Moment).catch(() => {});
}

/** "Bae liked / commented on your moment" on the author's phone (push worker). */
function notifyMomentActivity(momentId: string, kind: 'like' | 'comment', text?: string, replyTo?: string) {
  post('/moment-activity', {
    momentId,
    kind,
    ...(text ? { text: text.slice(0, 120) } : {}),
    ...(replyTo ? { replyTo } : {}),
  }).catch(() => {});
}

/** Newest first; `count` grows as the feed scrolls. */
export function useMomentsFeed(enabled: boolean, count: number) {
  const [state, setState] = useState<{ moments: Moment[]; error: string | null } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      query(collection(db, 'moments'), orderBy('createdAt', 'desc'), limit(count)),
      (snap) =>
        setState({
          moments: snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Moment),
          error: null,
        }),
      (err) => setState((s) => ({ moments: s?.moments ?? [], error: err.code }))
    );
  }, [enabled, count]);
  return state;
}

export function useMoment(id: string | undefined) {
  const [moment, setMoment] = useState<Moment | null | undefined>(undefined);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      momentRef(id),
      (snap) => setMoment(snap.exists() ? ({ id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) } as Moment) : null),
      () => setMoment(null)
    );
  }, [id]);
  return moment;
}

export function useComments(momentId: string | undefined) {
  const [comments, setComments] = useState<MomentComment[] | null>(null);
  useEffect(() => {
    if (!momentId) return;
    return onSnapshot(
      query(collection(db, 'moments', momentId, 'comments'), orderBy('createdAt', 'asc'), limit(300)),
      (snap) =>
        setComments(
          snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as MomentComment)
        ),
      () => setComments([])
    );
  }, [momentId]);
  return comments;
}

// Photos never change: keep them for the session.
const photoCache = new Map<string, Promise<string>>();

/** data: URI of a moment photo. */
export function loadMomentPhoto(photoId: string) {
  let pending = photoCache.get(photoId);
  if (!pending) {
    pending = getDoc(doc(db, 'momentMedia', photoId)).then((snap) => {
      const data = snap.get('data') as string | undefined;
      if (!data) throw new Error('moment/missing');
      return `data:image/jpeg;base64,${data}`;
    });
    pending.catch(() => photoCache.delete(photoId));
    photoCache.set(photoId, pending);
  }
  return pending;
}

export function useMomentPhoto(photoId: string) {
  const [state, setState] = useState<{ id: string; uri: string | null; failed: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    loadMomentPhoto(photoId).then(
      (uri) => active && setState({ id: photoId, uri, failed: false }),
      () => active && setState({ id: photoId, uri: null, failed: true })
    );
    return () => {
      active = false;
    };
  }, [photoId]);
  return state?.id === photoId ? state : { uri: null, failed: false };
}

// ── "New moments" dot on the tab ──

const SEEN_KEY = 'ichat.momentsSeenAt';
let seenAt = 0;
const seenListeners = new Set<() => void>();
AsyncStorage.getItem(SEEN_KEY)
  .then((v) => {
    seenAt = Number(v) || 0;
    seenListeners.forEach((l) => l());
  })
  .catch(() => {});

/** Opening the feed marks everything up to now as seen. */
export function markMomentsSeen() {
  seenAt = Date.now();
  seenListeners.forEach((l) => l());
  AsyncStorage.setItem(SEEN_KEY, String(seenAt)).catch(() => {});
}

/** Someone else posted after I last opened Moments. */
export function useNewMoments(myUid: string | undefined) {
  const [, setTick] = useState(0);
  const [latest, setLatest] = useState<{ at: number; authorId: string } | null>(null);
  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    seenListeners.add(l);
    return () => {
      seenListeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (!myUid) return;
    return onSnapshot(
      query(collection(db, 'moments'), orderBy('createdAt', 'desc'), limit(1)),
      (snap) => {
        const d = snap.docs[0];
        setLatest(d ? { at: (d.get('createdAt') as Timestamp | null)?.toMillis() ?? 0, authorId: d.get('authorId') } : null);
      },
      () => {}
    );
  }, [myUid]);
  return !!latest && latest.authorId !== myUid && latest.at > seenAt && seenAt > 0;
}
