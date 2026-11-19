// Browsers can't transcribe audio files: the Transcribe button is hidden on web.
export const canTranscribe = false;

export type TranscribeLang = 'en-US' | 'my-MM';
export const TRANSCRIBE_LANGS: { id: TranscribeLang; label: string }[] = [
  { id: 'en-US', label: 'English' },
  { id: 'my-MM', label: 'မြန်မာ' },
];

export async function cachedTranscript(_mediaId: string, _lang: TranscribeLang): Promise<string | null> {
  return null;
}

export async function transcribe(_mediaId: string, _uri: string, _lang: TranscribeLang): Promise<string> {
  throw Object.assign(new Error('transcribe/unavailable'), { code: 'transcribe/unavailable' });
}

export function transcribeErrorMessage(_err: unknown) {
  return 'Transcription is available in the iPhone app.';
}
