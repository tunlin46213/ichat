// Loaded only with the Stream SDK (stream-calls.tsx, native builds).
import { StreamVideoClient, StreamVideoRN } from '@stream-io/video-react-native-sdk';
import { Platform } from 'react-native';

import { auth } from '@/lib/firebase';
import { onBeforeLogout } from '@/lib/logout-hooks';
import { fetchStreamToken } from '@/lib/notify';
import { streamApiKey } from '@/lib/runtime';

/**
 * Name of the Firebase push provider in the Stream dashboard (Push Notifications →
 * Firebase). Stream sends the `call.ring` push through it.
 */
export const STREAM_PUSH_PROVIDER = 'firebase';

let configured = false;

/**
 * Android: when someone calls, Stream sends a push that @stream-io/react-native-callingx
 * turns into a full-screen incoming call (Accept / Decline, looping ringtone) through
 * Android's own phone system, even when iChat is closed. Accepting launches iChat and
 * joins the call. Must run as early as possible (module load), not inside React.
 *
 * iOS is left out: the free-Apple-ID build has no VoIP push (see react-native.config.js).
 */
export function setupAndroidRinging() {
  if (configured || Platform.OS !== 'android' || !streamApiKey) return;
  configured = true;
  try {
    StreamVideoRN.setPushConfig({
      android: {
        pushProviderName: STREAM_PUSH_PROVIDER,
        smallIcon: 'notification_icon',
        incomingChannel: { id: 'stream_incoming_call', name: 'Incoming calls', vibration: true },
        notificationTexts: { accepting: 'Connecting…', rejecting: 'Declining…' },
        titleTransformer: (name, incoming) => (incoming ? `${name} is calling` : `Calling ${name}`),
        // With iChat open, its own call screen shows the call.
        skipIncomingPushInForeground: true,
      },
      // A call accepted from the lock screen may start iChat from scratch: sign the
      // saved user back in to Stream so the SDK can join it.
      createStreamVideoClient: async () => {
        await auth.authStateReady();
        const user = auth.currentUser;
        if (!user || !streamApiKey) return undefined;
        return StreamVideoClient.getOrCreateInstance({
          apiKey: streamApiKey,
          user: { id: user.uid, name: user.displayName ?? 'User' },
          tokenProvider: fetchStreamToken,
        });
      },
    });
    // Signing out: remove this phone from Stream, or it keeps ringing for that account.
    onBeforeLogout(() => StreamVideoRN.onPushLogout());
  } catch (err) {
    // An APK built without the native modules: keep the in-app call screen working.
    console.warn('Android ringing is not available', err);
  }
}
