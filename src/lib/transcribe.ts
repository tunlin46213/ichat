import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModule as SpeechModule } from 'expo-speech-recognition';

/*
 * Voice message → text with Apple's speech recognizer (free). Runs on the voice note's
 * cached file. Results are kept on this phone so each note is only transcribed once.
 */

// Loaded only if this build includes the native module. Importing the package directly
// throws (and crashes the app at start) in Expo Go or an older build without it.
const ExpoSpeechRecognitionModule = requireOptionalNativeModule<typeof SpeechModule>('ExpoSpeechRecognition');

export const canTranscribe = ExpoSpeechRecognitionModule != null;

export type TranscribeLang = 'en-US' | 'my-MM';
export const TRANSCRIBE_LANGS: { id: TranscribeLang; label: string }[] = [
  { id: 'en-US', label: 'English' },
  { id: 'my-MM', label: 'မြန်မာ' },
];

const CACHE_KEY = 'ichat.transcripts.v1';
let cache: Record<string, string> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function loadCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? '{}') as Record<string, string>;
  } catch {
    cache = {};
  }
  return cache;
}

/** A transcript already made on this phone, if any. */
export async function cachedTranscript(mediaId: string, lang: TranscribeLang) {
  return (await loadCache())[`${mediaId}:${lang}`] ?? null;
}

function fail(code: string) {
  return Object.assign(new Error(code), { code });
}

function recognize(speech: typeof SpeechModule, uri: string, lang: TranscribeLang) {
  return new Promise<string>((resolve, reject) => {
    let text = '';
    let settled = false;
    const subs: { remove: () => void }[] = [];
    const done = (err: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subs.forEach((s) => s.remove());
      if (err) reject(err);
      else resolve(text.trim());
    };
    // Voice notes are ≤ 60 s; give recognition a generous limit.
    const timer = setTimeout(() => {
      speech.abort();
      done(fail('transcribe/timeout'));
    }, 90_000);
    subs.push(
      speech.addListener('result', (e) => {
        const best = e.results[0]?.transcript;
        if (best) text = best;
      }),
      speech.addListener('error', (e) => {
        // "no-speech" just means silence: return an empty transcript.
        if (e.error === 'no-speech') done(null);
        else done(fail(`transcribe/${e.error}`));
      }),
      speech.addListener('end', () => done(null))
    );
    speech.start({
      lang,
      interimResults: false,
      continuous: true,
      addsPunctuation: true,
      audioSource: { uri },
    });
  });
}

/** Transcribes a local audio file. One at a time (the recognizer is shared). */
export function transcribe(mediaId: string, uri: string, lang: TranscribeLang): Promise<string> {
  const run = async () => {
    const saved = await cachedTranscript(mediaId, lang);
    if (saved !== null) return saved;
    const speech = ExpoSpeechRecognitionModule;
    if (!speech) throw fail('transcribe/unavailable');
    const permission = await speech.requestSpeechRecognizerPermissionsAsync();
    if (!permission.granted) throw fail('transcribe/permission');
    if (!speech.isRecognitionAvailable()) throw fail('transcribe/unavailable');
    const text = await recognize(speech, uri, lang);
    const store = await loadCache();
    store[`${mediaId}:${lang}`] = text;
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(store)).catch(() => {});
    return text;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

export function transcribeErrorMessage(err: unknown) {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'transcribe/permission') return 'Allow Speech Recognition for iChat in Settings to transcribe.';
  if (code === 'transcribe/language-not-supported') return "This language isn't supported for transcription on this iPhone.";
  if (code === 'transcribe/network') return 'Transcription needs an internet connection for this language.';
  if (code === 'transcribe/unavailable' || code === 'transcribe/service-not-allowed') return 'Speech recognition is not available on this device.';
  if (code === 'transcribe/timeout') return 'Transcription took too long. Try again.';
  return 'Could not transcribe this voice message.';
}
