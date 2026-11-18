// Loaded only in development/production builds (see calls-provider.native.tsx).
import {
  CallingState,
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  useCalls as useStreamCalls,
  type Call,
} from '@stream-io/video-react-native-sdk';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/context/auth';
import { chatIdFor, sendCallMessage } from '@/lib/chat';
import { fetchStreamToken } from '@/lib/notify';
import { streamApiKey } from '@/lib/runtime';

import { CallPill, CallScreen } from './call-screen';
import { CallsContext } from './context';

// Issued by the Cloudflare worker (worker/src/index.ts → /stream-token).
const tokenProvider = fetchStreamToken;

/** Settles when the last client we dropped has finished disconnecting. */
let disconnecting: Promise<unknown> = Promise.resolve();

/**
 * Writes "📞 Voice call · 3:24" or "Missed voice call" into the chat once the call I
 * started is over. Only the caller logs it, so each call appears once.
 */
function logCallWhenOver(call: Call, myUid: string, otherId: string, video: boolean) {
  let joinedAt = 0;
  let done = false;
  let sub: { unsubscribe: () => void } | undefined = undefined;
  sub = call.state.callingState$.subscribe((state) => {
    if (done) return;
    if (state === CallingState.JOINED && !joinedAt) joinedAt = Date.now();
    if (state !== CallingState.LEFT && state !== CallingState.RECONNECTING_FAILED) return;
    done = true;
    // The first value can arrive synchronously, before `sub` is assigned.
    setTimeout(() => sub?.unsubscribe(), 0);
    sendCallMessage(chatIdFor(myUid, otherId), myUid, otherId, {
      video,
      answered: joinedAt > 0,
      durationMs: joinedAt ? Date.now() - joinedAt : 0,
    }).catch((err) => console.warn('Could not log call', err));
  });
}

function newCallId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Connects the signed-in user to Stream Video, shows incoming/outgoing ringing
 * calls full-screen above the app, and exposes startCall() to chat screens.
 */
export function StreamCallsProvider({ children }: { children: ReactNode }) {
  const { user, displayName } = useAuth();
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const uid = user?.uid;
  const name = displayName ?? 'User';
  // No `image`: avatars are data: URIs (tens of KB), too big for Stream user data.

  useEffect(() => {
    if (!uid || !streamApiKey) return;
    let active = true;
    let instance: StreamVideoClient | null = null;
    // Wait until the previous client (e.g. before a name change) has fully disconnected.
    // getOrCreateInstance looks clients up by user id, and a client is only removed from
    // that lookup once disconnectUser() finishes — creating too early returned the dying
    // client, which never reconnected, so every call failed.
    const created = disconnecting.then(() => {
      if (!active) return;
      instance = StreamVideoClient.getOrCreateInstance({
        apiKey: streamApiKey!,
        user: { id: uid, name },
        tokenProvider,
      });
      setClient(instance);
    });
    return () => {
      active = false;
      setClient(null);
      disconnecting = created.then(() => instance?.disconnectUser()).catch(() => {});
    };
  }, [uid, name]);

  async function startCall(other: { id: string; name: string }, { video = false } = {}) {
    if (!client || !uid) throw new Error('Calls are not connected yet.');
    const call = client.call('default', newCallId());
    // Voice calls keep the camera off and ring as an audio call; video calls
    // start with the front camera on.
    if (video) await call.camera.enable();
    else await call.camera.disable();
    await call.getOrCreate({
      ring: true,
      video,
      // custom.video tells the other phone which screen to show before it answers.
      data: { members: [{ user_id: uid }, { user_id: other.id }], custom: { video } },
    });
    logCallWhenOver(call, uid, other.id, video);
  }

  // `children` (the whole app) always sits at the same place in the tree. Wrapping it in
  // <StreamVideo> only once the client existed changed its parent, which remounted every
  // screen and reset navigation whenever the client connected or was recreated.
  // Nothing outside this file uses Stream hooks, so only the call UI needs the provider.
  return (
    <CallsContext value={{ startCall: client ? startCall : null }}>
      {children}
      {client ? (
        <StreamVideo client={client}>
          <RingingCalls myUid={uid!} />
        </StreamVideo>
      ) : null}
    </CallsContext>
  );
}

/** Full-screen incoming / outgoing / in-call UI for the current ringing call. */
function RingingCalls({ myUid }: { myUid: string }) {
  const ringing = useStreamCalls().filter((c) => c.ringing);
  const call = ringing[0];
  if (!call) return null;
  // Keyed by call so a new call always starts full screen.
  return <CallOverlay key={call.cid} call={call} myUid={myUid} />;
}

/** Full-screen call, or — minimized — a small floating pill so the app stays usable. */
function CallOverlay({ call, myUid }: { call: Call; myUid: string }) {
  const [minimized, setMinimized] = useState(false);
  return (
    <StreamCall call={call}>
      {minimized ? (
        <CallPill myUid={myUid} onExpand={() => setMinimized(false)} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.overlay]}>
          <CallScreen myUid={myUid} onMinimize={() => setMinimized(true)} />
        </View>
      )}
    </StreamCall>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: '#000', zIndex: 1000 },
});
