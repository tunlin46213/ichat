import { readMediaBase64 } from '@/lib/media';

/** Browser: download the photo as a .jpg file. */
export async function savePhotoToLibrary(chatId: string, mediaId: string) {
  const data = await readMediaBase64(chatId, mediaId);
  const a = document.createElement('a');
  a.href = `data:image/jpeg;base64,${data}`;
  a.download = `ichat-${mediaId}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function saveBase64Photo(base64: string, name: string) {
  const a = document.createElement('a');
  a.href = `data:image/jpeg;base64,${base64}`;
  a.download = `ichat-${name}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const saveLabel = 'Download';
