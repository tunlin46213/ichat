import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocFromCache,
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

import { ensureChat, sendMessage, type SharedMoment } from '@/lib/chat';
import { db } from '@/lib/firebase';
import type { PickedImage } from '@/lib/media';
import { submitReport, type ReportReason } from '@/lib/moderation';
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
  /** uids @mentioned in the text */
  mentions?: string[];
  likes?: Record<string, Timestamp | null>;
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

// Moments deleted from this phone (their page then leaves without "no longer available").
const deletedHere = new Set<string>();
export const wasDeletedHere = (id: string) => deletedHere.has(id);

export async function deleteMoment(moment: Moment) {
  deletedHere.add(moment.id);
  // Comments first (rules let the author delete them while the moment still exists).
  const comments = await getDocs(collection(db, 'moments', moment.id, 'comments'));
  const batch = writeBatch(db);
  for (const c of comments.docs.slice(0, 400)) batch.delete(c.ref);
  for (const p of moment.photos ?? []) batch.delete(doc(db, 'momentMedia', p.id));
  batch.delete(momentRef(moment.id));
  await batch.commit().catch((err) => {
    deletedHere.delete(moment.id);
    throw err;
  });
}

export function isLiked(moment: Moment, uid: string) {
  return !!moment.likes?.[uid];
}

export async function toggleLike(moment: Moment, uid: string) {
  const liked = isLiked(moment, uid);
  await updateDoc(momentRef(moment.id), { [`likes.${uid}`]: liked ? deleteField() : serverTimestamp() });
  if (!liked && moment.authorId !== uid) notifyMomentActivity(moment.id, 'like');
}

export async function addComment(
  momentId: string,
  authorId: string,
  text: string,
  replyTo?: CommentReplyTo,
  mentions: string[] = []
) {
  const clean = text.trim().slice(0, MAX_COMMENT_TEXT);
  if (!clean) return;
  // Comment and counter together, so the count never drifts from the comments.
  const batch = writeBatch(db);
  const ref = doc(collection(db, 'moments', momentId, 'comments'));
  const mentioned = [...new Set(mentions)].filter((uid) => uid !== authorId).slice(0, 10);
  batch.set(ref, {
    authorId,
    text: clean,
    ...(mentioned.length ? { mentions: mentioned } : {}),
    ...(replyTo ? { replyTo: { id: replyTo.id, authorId: replyTo.authorId, name: replyTo.name.slice(0, 60) } } : {}),
    createdAt: serverTimestamp(),
  });
  batch.update(momentRef(momentId), { commentCount: increment(1) });
  await batch.commit();
  notifyMomentActivity(momentId, 'comment', clean, replyTo?.id, ref.id);
}

export async function deleteComment(momentId: string, commentId: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'moments', momentId, 'comments', commentId));
  batch.update(momentRef(momentId), { commentCount: increment(-1) });
  await batch.commit();
}

export async function toggleCommentLike(momentId: string, comment: MomentComment, uid: string) {
  const liked = !!comment.likes?.[uid];
  await updateDoc(doc(db, 'moments', momentId, 'comments', comment.id), {
    [`likes.${uid}`]: liked ? deleteField() : serverTimestamp(),
  });
}

/** Report a moment to the admin (shows in the dashboard's Reports). */
export function reportMoment(moment: Moment, reporterId: string, reason: ReportReason) {
  return submitReport({
    reporterId,
    reportedUserId: moment.authorId,
    reason,
    messageId: `moment:${moment.id}`,
    messageText: moment.text ?? (moment.photos?.length ? `[${moment.photos.length} photo moment]` : ''),
  });
}

/** Sends a moment into a 1:1 chat as a preview card; returns the chat id. */
export async function shareMomentToChat(
  momentId: string,
  me: { uid: string; name: string },
  to: { uid: string; name: string },
  authorName: string
) {
  const snap = await getDoc(momentRef(momentId));
  if (!snap.exists()) throw new Error('moment/missing');
  const m = { id: snap.id, ...snap.data() } as Moment;
  const first = m.photos?.[0];
  const card: SharedMoment = {
    id: m.id,
    authorId: m.authorId,
    authorName: authorName.slice(0, 60),
    ...(m.text ? { text: m.text.slice(0, 200) } : {}),
    ...(first ? { photoId: first.id, ...(first.thumb ? { thumb: first.thumb } : {}), photoCount: m.photos!.length } : {}),
  };
  const who = m.authorId === me.uid ? 'my' : `${authorName.split(' ')[0]}'s`;
  const chatId = await ensureChat(me, to);
  await sendMessage(chatId, me.uid, to.uid, `Shared ${who} moment${m.text ? `: ${m.text.slice(0, 80)}` : ''}`, null, {
    moment: card,
  });
  return chatId;
}

/** Account deletion: remove my moments (with their photos and comments). */
export async function deleteMyMoments(uid: string) {
  const mine = await getDocs(query(collection(db, 'moments'), where('authorId', '==', uid), limit(200)));
  for (const d of mine.docs) await deleteMoment({ id: d.id, ...d.data() } as Moment).catch(() => {});
}

/** "Bae liked / commented on your moment" on the author's phone (push worker). */
function notifyMomentActivity(
  momentId: string,
  kind: 'like' | 'comment',
  text?: string,
  replyTo?: string,
  commentId?: string
) {
  post('/moment-activity', {
    momentId,
    kind,
    ...(text ? { text: text.slice(0, 120) } : {}),
    ...(replyTo ? { replyTo } : {}),
    // The worker reads @mentions from the saved comment itself.
    ...(commentId ? { commentId } : {}),
  }).catch(() => {});
}

/** Newest first; `count` grows as the feed scrolls; a new `reload` re-subscribes (pull to refresh). */
export function useMomentsFeed(enabled: boolean, count: number, reload = 0) {
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
  }, [enabled, count, reload]);
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

/** The newest `count` comments, oldest first (the preview under a card in the feed). */
export function useRecentComments(momentId: string, enabled: boolean, count = 2) {
  const [state, setState] = useState<{ id: string; comments: MomentComment[] } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      query(collection(db, 'moments', momentId, 'comments'), orderBy('createdAt', 'desc'), limit(count)),
      (snap) =>
        setState({
          id: momentId,
          comments: snap.docs
            .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as MomentComment)
            .reverse(),
        }),
      () => setState({ id: momentId, comments: [] })
    );
  }, [momentId, enabled, count]);
  return enabled && state?.id === momentId ? state.comments : [];
}

// Photos never change: keep them for the session.
const photoCache = new Map<string, Promise<string>>();

/** data: URI of a moment photo. */
export function loadMomentPhoto(photoId: string) {
  let pending = photoCache.get(photoId);
  if (!pending) {
    const ref = doc(db, 'momentMedia', photoId);
    // My own just-posted photo is in the local cache before the server has it (the feed
    // shows the post right away), so look there first.
    pending = getDocFromCache(ref)
      .then((snap) => (snap.exists() ? snap : getDoc(ref)))
      .catch(() => getDoc(ref))
      .then((snap) => {
        const data = snap.get('data') as string | undefined;
        if (!data) throw new Error('moment/missing');
        return `data:image/jpeg;base64,${data}`;
      });
    pending.catch(() => photoCache.delete(photoId));
    photoCache.set(photoId, pending);
  }
  return pending;
}

const RETRY_MS = [1500, 4000, 10_000];

export function useMomentPhoto(photoId: string) {
  const [state, setState] = useState<{ id: string; uri: string | null; failed: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A post can show up a moment before its photos reach the server: try again a few times.
    const attempt = (n: number) => {
      loadMomentPhoto(photoId).then(
        (uri) => active && setState({ id: photoId, uri, failed: false }),
        () => {
          if (!active) return;
          if (n < RETRY_MS.length) timer = setTimeout(() => attempt(n + 1), RETRY_MS[n]);
          else setState({ id: photoId, uri: null, failed: true });
        }
      );
    };
    attempt(0);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
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

/** When I last looked at the feed (0 = never): posts after it are "new". */
export function getMomentsSeenAt() {
  return seenAt;
}

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

// ── Someone's moments (contact profile grid, "On this day") ──

/** A person's moments, newest first (no composite index: sorted here). */
export function useUserMoments(uid: string | undefined, max = 60) {
  const [state, setState] = useState<{ uid: string; moments: Moment[] } | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'moments'), where('authorId', '==', uid), limit(max)),
      (snap) =>
        setState({
          uid,
          moments: snap.docs
            .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Moment)
            .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)),
        }),
      () => setState({ uid, moments: [] })
    );
  }, [uid, max]);
  return uid && state?.uid === uid ? state.moments : null;
}

export type MomentMemory = { moment: Moment; label: string };

/** My moment from this day a year (or more) ago, or a month ago. */
export function findMomentMemory(mine: Moment[], now = new Date()): MomentMemory | null {
  const sameDay = (d: Date) => d.getDate() === now.getDate();
  for (const m of mine) {
    const at = m.createdAt?.toDate();
    if (!at || !sameDay(at)) continue;
    const years = now.getFullYear() - at.getFullYear();
    if (years >= 1 && at.getMonth() === now.getMonth()) {
      return { moment: m, label: years === 1 ? '1 year ago today' : `${years} years ago today` };
    }
  }
  for (const m of mine) {
    const at = m.createdAt?.toDate();
    if (!at || !sameDay(at)) continue;
    const months = (now.getFullYear() - at.getFullYear()) * 12 + now.getMonth() - at.getMonth();
    if (months === 1) return { moment: m, label: '1 month ago today' };
  }
  return null;
}

const MEMORY_KEY = 'ichat.momentMemoryHidden';

/** "Not today" for the On this day card. */
export async function isMemoryHiddenToday() {
  return (await AsyncStorage.getItem(MEMORY_KEY).catch(() => null)) === new Date().toDateString();
}

export function hideMemoryToday() {
  AsyncStorage.setItem(MEMORY_KEY, new Date().toDateString()).catch(() => {});
}

// ── Draft of an unfinished moment ──

const DRAFT_KEY = 'ichat.momentDraft';
/** AsyncStorage is small on Android (≈ 6 MB in all): only keep photos if they fit. */
const DRAFT_PHOTO_BUDGET = 2_500_000;

export type MomentDraft = { text: string; photos: PickedImage[] };

export async function loadMomentDraft(): Promise<MomentDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    const draft = raw ? (JSON.parse(raw) as MomentDraft) : null;
    return draft && (draft.text?.trim() || draft.photos?.length) ? draft : null;
  } catch {
    return null;
  }
}

/** Returns false when the photos were too big to keep (the text is still saved). */
export async function saveMomentDraft(draft: MomentDraft) {
  if (!draft.text.trim() && !draft.photos.length) {
    await clearMomentDraft();
    return true;
  }
  const size = draft.photos.reduce((n, p) => n + p.base64.length, 0);
  const keepPhotos = size <= DRAFT_PHOTO_BUDGET;
  await AsyncStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ text: draft.text, photos: keepPhotos ? draft.photos : [] })
  ).catch(() => {});
  return keepPhotos;
}

export function clearMomentDraft() {
  return AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
}
