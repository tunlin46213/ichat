// Loaded only in development/production builds (see calls-provider.native.tsx).
import {
  RingingCallContent,
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  useCalls as useStreamCalls,
} from '@stream-io/video-react-native-sdk';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { useUserProfile } from '@/hooks/use-user-profile';
import { fetchStreamToken } from '@/lib/notify';
import { streamApiKey } from '@/lib/runtime';

import { CallsContext } from './context';

// Issued by the Cloudflare worker (worker/src/index.ts → /stream-token).
const tokenProvider = fetchStreamToken;

function newCallId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Connects the signed-in user to Stream Video, shows incoming/outgoing ringing
 * calls full-screen above the app, and exposes startCall() to chat screens.
 */
export function StreamCallsProvider({ children }: { children: ReactNode }) {
  const { user, displayName } = useAuth();
  const profile = useUserProfile(user?.uid);
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const uid = user?.uid;
  const name = displayName ?? 'User';
  const image = profile?.avatarUrl ?? undefined;

  useEffect(() => {
    if (!uid || !streamApiKey) return;
    // getOrCreateInstance keeps one client across re-renders and app backgrounding.
    const instance = StreamVideoClient.getOrCreateInstance({
      apiKey: streamApiKey,
      user: { id: uid, name, image },
      tokenProvider,
    });
    // Publish it asynchronously (after this effect) so React doesn't re-render mid-effect.
    let active = true;
    Promise.resolve().then(() => active && setClient(instance));
    return () => {
      active = false;
      instance.disconnectUser().catch(() => {});
      setClient(null);
    };
  }, [uid, name, image]);

  async function startCall(other: { id: string; name: string }) {
    if (!client || !uid) throw new Error('Calls are not connected yet.');
    const call = client.call('default', newCallId());
    // Voice only: no camera, and the ringing shows as an audio call.
    await call.camera.disable();
    await call.getOrCreate({
      ring: true,
      video: false,
      data: { members: [{ user_id: uid }, { user_id: other.id }] },
    });
  }

  if (!client) {
    return <CallsContext value={{ startCall: null }}>{children}</CallsContext>;
  }

  return (
    <StreamVideo client={client}>
      <CallsContext value={{ startCall }}>
        {children}
        <RingingCalls />
      </CallsContext>
    </StreamVideo>
  );
}

/** Full-screen incoming / outgoing / in-call UI for the current ringing call. */
function RingingCalls() {
  const ringing = useStreamCalls().filter((c) => c.ringing);
  const call = ringing[0];
  if (!call) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      <StreamCall call={call}>
        <SafeAreaView style={styles.flex}>
          <RingingCallContent />
        </SafeAreaView>
      </StreamCall>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { backgroundColor: '#000', zIndex: 1000 },
});
