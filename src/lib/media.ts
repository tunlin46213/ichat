import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { Platform } from 'react-native';

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

export type PickedImage = { base64: string; width: number; height: number };

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

/** Opens the photo library or camera and returns a compressed JPEG (base64). */
export async function pickImage(
  source: 'library' | 'camera',
  maxSide = 1280
): Promise<PickedImage | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw mediaError('media/permission');

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return compress(asset.uri, asset.width, asset.height, maxSide);
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

const PREVIEW = { image: '📷 Photo', audio: '🎤 Voice message' } as const;

/** Stores the file in chats/{chatId}/media and posts the message, in one atomic write. */
export async function sendMediaMessage(
  chatId: string,
  senderId: string,
  recipientId: string,
  media:
    | { type: 'image'; base64: string; width: number; height: number }
    | { type: 'audio'; uri: string; durationMs: number }
) {
  const isAudio = media.type === 'audio';
  const base64 = isAudio ? await readBase64(media.uri) : media.base64;
  if (base64.length > MAX_BASE64) throw mediaError('media/too-large');
  const mime = isAudio ? (Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4') : 'image/jpeg';

  const mediaRef = doc(collection(db, 'chats', chatId, 'media'));
  const messageRef = doc(collection(db, 'chats', chatId, 'messages'));
  const batch = writeBatch(db);
  batch.set(mediaRef, { data: base64, mime, senderId, createdAt: serverTimestamp() });
  batch.set(messageRef, {
    type: media.type,
    text: '',
    mediaId: mediaRef.id,
    mime,
    senderId,
    createdAt: serverTimestamp(),
    ...(isAudio
      ? { durationMs: Math.round(media.durationMs) }
      : { width: media.width, height: media.height }),
  });
  batch.update(doc(db, 'chats', chatId), {
    lastMessage: PREVIEW[media.type],
    lastSenderId: senderId,
    updatedAt: serverTimestamp(),
    [`unread.${recipientId}`]: increment(1),
    [`lastRead.${senderId}`]: serverTimestamp(),
    [`typing.${senderId}`]: null,
  });
  await batch.commit();
  notifyRecipient(chatId, PREVIEW[media.type]);
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
