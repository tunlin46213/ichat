import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { Platform } from 'react-native';

import { addChatUpdate, previewFor } from '@/lib/chat';
import { db } from '@/lib/firebase';
import { notifyRecipient } from '@/lib/notify';

/*
 * Photos and voice messages are stored inside Firestore (base64), not Firebase
 * Storage, so the app runs on the free Spark plan with no card. Each file lives in
 * its own doc (chats/{chatId}/media/{id}) so loading the message list stays light.
 * A Firestore document is at most 1 MiB, so files are compressed to stay under it.
 */
const MAX_BASE64 = 900_000; // ≈ 650 KB binary, leaves room for the other fields
export const MAX_VOICE_MS = 60_000;

export type PickedImage = {
  base64: string;
  width: number;
  height: number;
  /** tiny (~24 px) JPEG shown blurred while the full photo loads */
  thumb?: string;
  /** small (~360 px) JPEG kept in my story archive after the story expires */
  preview?: string;
};

function mediaError(code: string) {
  return Object.assign(new Error(code), { code });
}

/** Resize + JPEG-compress, stepping down until it fits in a Firestore doc. */
async function compress(uri: string, width: number, height: number, maxSide: number, minQuality = 0.4) {
  const attempts: [number, number][] = [
    [maxSide, 0.7],
    [maxSide * 0.8, 0.6],
    [maxSide * 0.6, 0.5],
    [maxSide * 0.45, minQuality],
  ];
  for (const [side, quality] of attempts) {
    const scale = Math.min(1, side / Math.max(width, height));
    const context = ImageManipulator.manipulate(uri);
    if (scale < 1) context.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
    const saved = await (await context.renderAsync()).saveAsync({
      compress: quality,
      format: SaveFormat.JPEG,
      base64: true,
    });
    if (saved.base64 && saved.base64.length <= MAX_BASE64) {
      return { base64: saved.base64, width: saved.width, height: saved.height };
    }
  }
  throw mediaError('media/too-large');
}

export const MAX_PHOTOS = 10;

async function launchPicker(source: 'library' | 'camera', multiple: boolean) {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw mediaError('media/permission');

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    ...(multiple && source === 'library'
      ? { allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS, orderedSelection: true }
      : {}),
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? [] : result.assets;
}

/** Opens the photo library or camera and returns a compressed JPEG (base64). */
export async function pickImage(
  source: 'library' | 'camera',
  maxSide = 1280
): Promise<PickedImage | null> {
  const asset = (await launchPicker(source, false))[0];
  if (!asset) return null;
  return compress(asset.uri, asset.width, asset.height, maxSide);
}

/**
 * Lets the user pick up to MAX_PHOTOS photos (one from the camera). Returns a function
 * per photo that compresses it on demand, so a big album doesn't sit in memory at once.
 */
export async function pickImages(source: 'library' | 'camera', maxSide = 1280) {
  const assets = await launchPicker(source, true);
  return assets.map((a) => async (): Promise<PickedImage> => {
    const image = await compress(a.uri, a.width, a.height, maxSide);
    return { ...image, thumb: await tinyThumb(a.uri, a.width, a.height) };
  });
}

/** A photo for a story: the full one, plus a small preview for my private story archive. */
export async function pickStoryImage(source: 'library' | 'camera'): Promise<PickedImage | null> {
  const asset = (await launchPicker(source, false))[0];
  if (!asset) return null;
  const image = await compress(asset.uri, asset.width, asset.height, 1080);
  let preview: string | undefined;
  try {
    // ~25–40 KB: small enough to keep every story in the free 1 GB.
    preview = (await compress(asset.uri, asset.width, asset.height, 360, 0.4)).base64;
    if (preview.length > 80_000) preview = undefined;
  } catch {
    preview = undefined;
  }
  return { ...image, preview };
}

/** A ~24 px base64 JPEG (well under 1 KB) for the blur-up placeholder. */
async function tinyThumb(uri: string, width: number, height: number) {
  try {
    const scale = 24 / Math.max(width, height, 1);
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) });
    const saved = await (await context.renderAsync()).saveAsync({ compress: 0.5, format: SaveFormat.JPEG, base64: true });
    return saved.base64 && saved.base64.length < 2000 ? saved.base64 : undefined;
  } catch {
    return undefined;
  }
}

/** Reads a recorded file (file:// on iOS, blob: on web) as base64. */
async function readBase64(uri: string) {
  if (Platform.OS !== 'web') return new File(uri).base64();
  const blob = await (await fetch(uri)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Stores the file in chats/{chatId}/media and posts the message, in one atomic write. */
export async function sendMediaMessage(
  chatId: string,
  senderId: string,
  recipientId: string,
  media:
    | { type: 'image'; base64: string; width: number; height: number; thumb?: string }
    | {
        type: 'audio';
        /** a recording to read, or base64 already in hand (forwarding) */
        uri?: string;
        base64?: string;
        mime?: string;
        durationMs: number;
        waveform?: number[];
      },
  { forwarded = false } = {}
) {
  const isAudio = media.type === 'audio';
  const base64 = isAudio ? (media.base64 ?? (await readBase64(media.uri ?? ''))) : media.base64;
  if (base64.length > MAX_BASE64) throw mediaError('media/too-large');
  const mime = isAudio
    ? (media.mime ?? (Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4'))
    : 'image/jpeg';

  const mediaRef = doc(collection(db, 'chats', chatId, 'media'));
  const messageRef = doc(collection(db, 'chats', chatId, 'messages'));
  const batch = writeBatch(db);
  // size: lets Settings → Storage add up usage without downloading the photos.
  batch.set(mediaRef, { data: base64, mime, senderId, size: base64.length, createdAt: serverTimestamp() });
  batch.set(messageRef, {
    type: media.type,
    text: '',
    mediaId: mediaRef.id,
    mime,
    senderId,
    createdAt: serverTimestamp(),
    ...(isAudio
      ? {
          durationMs: Math.round(media.durationMs),
          ...(media.waveform?.length ? { waveform: media.waveform } : {}),
        }
      : { width: media.width, height: media.height, ...(media.thumb ? { thumb: media.thumb } : {}) }),
    ...(forwarded ? { forwarded: true } : {}),
  });
  const preview = previewFor({
    type: media.type,
    text: '',
    durationMs: isAudio ? media.durationMs : undefined,
  });
  addChatUpdate(batch, chatId, senderId, recipientId, preview);
  await batch.commit();
  notifyRecipient(chatId, preview);
}

/** The raw base64 of a stored photo / voice note (for forwarding). */
export async function readMediaBase64(chatId: string, mediaId: string) {
  const snap = await getDoc(doc(db, 'chats', chatId, 'media', mediaId));
  const data = snap.get('data') as string | undefined;
  if (!data) throw mediaError('media/missing');
  return data;
}

// Loaded media, by chat/media id → playable/displayable URI. Files never change.
const cache = new Map<string, Promise<string>>();

/**
 * Returns a URI for a stored photo/voice note: a data: URI for images (and all web
 * media), or a cached file for native audio (iOS can't play data: URIs).
 */
export function loadMediaUri(chatId: string, mediaId: string, mime: string) {
  const key = `${chatId}/${mediaId}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      const snap = await getDoc(doc(db, 'chats', chatId, 'media', mediaId));
      const data = snap.get('data') as string | undefined;
      if (!data) throw mediaError('media/missing');
      if (Platform.OS === 'web' || mime.startsWith('image/')) return `data:${mime};base64,${data}`;
      const file = new File(Paths.cache, `${mediaId}.${mime === 'audio/webm' ? 'webm' : 'm4a'}`);
      if (!file.exists) await file.write(data, { encoding: 'base64' });
      return file.uri;
    })();
    pending.catch(() => cache.delete(key)); // allow retry after a failure
    cache.set(key, pending);
  }
  return pending;
}

/** Saves a small (256px) profile photo straight onto the public profile. */
export async function updateAvatar(uid: string, image: PickedImage) {
  await updateDoc(doc(db, 'users', uid), { avatarUrl: `data:image/jpeg;base64,${image.base64}` });
}

/** Friendly text for picker/recording/upload failures. */
export function mediaErrorMessage(err: unknown) {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'media/permission') return 'Allow photo or camera access in Settings to share photos.';
  if (code === 'media/too-large') return 'That file is too large to send. Try a shorter voice message or another photo.';
  if (code === 'permission-denied') return 'Sending was blocked by the database security rules.';
  return 'Something went wrong. Please try again.';
}
