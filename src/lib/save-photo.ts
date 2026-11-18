import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

import { readMediaBase64 } from '@/lib/media';

/** Saves a chat photo to the iPhone's Photos library (asks for add-only access). */
export async function savePhotoToLibrary(chatId: string, mediaId: string) {
  const { granted } = await requestPermissionsAsync(true);
  if (!granted) throw Object.assign(new Error('save/permission'), { code: 'save/permission' });
  const file = new File(Paths.cache, `ichat-${mediaId}.jpg`);
  if (!file.exists) file.write(await readMediaBase64(chatId, mediaId), { encoding: 'base64' });
  await Asset.create(file.uri);
}

export const saveLabel = 'Save to Photos';
