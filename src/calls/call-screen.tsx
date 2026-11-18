// Native only: imported by stream-calls.tsx, which is lazy-loaded in real builds.
import {
  callManager,
  CallingState,
  hasVideo,
  ParticipantView,
  useCall,
  useCallStateHooks,
  type StreamVideoParticipant,
} from '@stream-io/video-react-native-sdk';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon, type IconName } from '@/components/icon';
import { useNow } from '@/hooks/use-now';
import { useUserProfile } from '@/hooks/use-user-profile';
import { formatDuration } from '@/lib/chat';
import { haptics } from '@/lib/haptics';

const NO_AVATAR_BG = 'linear-gradient(160deg, #1B2D52 0%, #34184A 55%, #0D0716 100%)';

/**
 * Full-screen call UI: ringing (incoming / outgoing) with a blurred photo backdrop
 * and ripples around the avatar, then the call itself — the other person's video
 * full screen with mine in a corner, or the avatar and a timer for voice calls.
 */
export function CallScreen({ myUid, onMinimize }: { myUid: string; onMinimize?: () => void }) {
  const call = useCall();
  const insets = useSafeAreaInsets();
  const {
    useCallCallingState,
    useCallMembers,
    useCallCustomData,
    useRemoteParticipants,
    useLocalParticipant,
    useMicrophoneState,
    useCameraState,
    useCallStartedAt,
  } = useCallStateHooks();
  const state = useCallCallingState();
  const members = useCallMembers();
  const custom = useCallCustomData();
  const remote = useRemoteParticipants()[0];
  const local = useLocalParticipant();
  const { optimisticIsMute: micMuted, microphone } = useMicrophoneState();
  const { optimisticIsMute: camMuted, camera } = useCameraState();
  const startedAt = useCallStartedAt();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const other = members.find((m) => m.user_id !== myUid);
  const otherId = other?.user_id ?? '';
  const profile = useUserProfile(otherId || undefined);
  const name = profile?.name ?? other?.user?.name ?? 'Unknown';
  const avatarUrl = profile?.avatarUrl ?? null;
  // Set by the caller (stream-calls.tsx → startCall). Older calls fall back to the camera.
  const isVideo = typeof custom?.video === 'boolean' ? (custom.video as boolean) : !camMuted;
  const [speaker, setSpeaker] = useState(isVideo);

  const incoming = state === CallingState.RINGING && !call?.isCreatedByMe;
  const outgoing = state === CallingState.RINGING && !!call?.isCreatedByMe;
  const connecting = state === CallingState.JOINING || state === CallingState.IDLE;
  const reconnecting = state === CallingState.RECONNECTING || state === CallingState.MIGRATING;
  const ended = state === CallingState.LEFT || state === CallingState.RECONNECTING_FAILED;
  const inCall = !incoming && !outgoing && !ended;
  const remoteVideo = !!remote && hasVideo(remote);

  // Once connected, route audio the way the Speaker button shows (video: speaker,
  // voice: earpiece), whatever the call type's default device is.
  const joined = state === CallingState.JOINED;
  const speakerRef = useRef(speaker);
  useEffect(() => {
    speakerRef.current = speaker;
  });
  useEffect(() => {
    if (!joined) return;
    try {
      callManager.speaker.setForceSpeakerphoneOn(speakerRef.current);
    } catch {
      // Not supported on this device.
    }
  }, [joined]);

  // 1:1 calls: once the other person has hung up, end the call here too.
  const hadRemote = useRef(false);
  const remoteId = remote?.sessionId;
  useEffect(() => {
    if (remoteId) {
      hadRemote.current = true;
      return;
    }
    if (!hadRemote.current || state !== CallingState.JOINED || !call) return;
    const timer = setTimeout(() => call.leave().catch(() => {}), 1200);
    return () => clearTimeout(timer);
  }, [remoteId, state, call]);

  async function accept() {
    if (!call || busy) return;
    setBusy(true);
    setError(null);
    haptics.medium();
    try {
      // Answer a voice call without the camera, a video call with it.
      if (isVideo) await call.camera.enable();
      else await call.camera.disable();
      await call.join();
    } catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : 'Could not join the call.');
    } finally {
      setBusy(false);
    }
  }

  async function hangUp(reason?: 'decline' | 'cancel') {
    if (!call || state === CallingState.LEFT) return;
    haptics.medium();
    try {
      if (reason) await call.leave({ reject: true, reason });
      else await call.leave();
    } catch {
      // Already gone.
    }
  }

  function toggleSpeaker() {
    const next = !speaker;
    haptics.light();
    setSpeaker(next);
    try {
      callManager.speaker.setForceSpeakerphoneOn(next);
    } catch {
      // Not supported on this device.
    }
  }

  const status = ended
    ? 'Call ended'
    : incoming
      ? `iChat ${isVideo ? 'video' : 'voice'} call`
      : outgoing
        ? 'Calling…'
        : connecting
          ? 'Connecting…'
          : reconnecting
            ? 'Reconnecting…'
            : null;

  return (
    <View style={styles.fill}>
      {/* Backdrop: their video in a video call, otherwise their photo blurred. */}
      {inCall && remoteVideo ? (
        <ParticipantView
          participant={remote}
          trackType="videoTrack"
          objectFit="cover"
          style={StyleSheet.absoluteFill}
          ParticipantLabel={null}
          ParticipantNetworkQualityIndicator={null}
          ParticipantReaction={null}
        />
      ) : outgoing && isVideo && local && !camMuted ? (
        // Calling with video: see yourself while it rings, like FaceTime.
        <LocalVideo participant={local} style={StyleSheet.absoluteFill} />
      ) : (
        <PhotoBackdrop uri={avatarUrl} />
      )}
      <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />

      {/* Shrink to a floating pill and go back to the app while the call continues. */}
      {inCall && onMinimize ? (
        <Pressable
          onPress={() => {
            haptics.light();
            onMinimize();
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Minimize call"
          style={[styles.minimize, { top: insets.top + 8 }]}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <Icon name="chevron.down" size={18} color="#fff" fallback="⌄" />
        </Pressable>
      ) : null}

      {/* Who and status. In a video call with their camera on, keep it small at the top. */}
      {inCall && remoteVideo ? (
        <Animated.View entering={FadeIn} style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.topName} numberOfLines={1}>
            {name}
          </Text>
          <CallTimer startedAt={startedAt} fallback={status} />
        </Animated.View>
      ) : (
        <View style={[styles.center, { paddingTop: insets.top + 60 }]}>
          <Ripples active={incoming || outgoing} />
          <Animated.View entering={FadeInDown.springify().damping(14)}>
            <Avatar id={otherId || 'call'} name={name} size={128} uri={avatarUrl} />
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(60)} style={styles.name} numberOfLines={1}>
            {name}
          </Animated.Text>
          {inCall && !connecting && !reconnecting ? (
            <CallTimer startedAt={startedAt} fallback={status} large />
          ) : (
            <Text style={styles.status}>{status}</Text>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      )}

      {/* My camera in the corner during a video call. */}
      {inCall && isVideo && local && !camMuted ? (
        <Animated.View entering={FadeIn} style={[styles.pip, { top: insets.top + 56 }]}>
          <LocalVideo participant={local} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}

      {/* Controls */}
      <Animated.View
        entering={FadeInUp.springify().damping(18)}
        style={[styles.controls, { paddingBottom: insets.bottom + 28 }]}>
        {incoming ? (
          <View style={styles.answerRow}>
            <BigButton
              icon="phone.down.fill"
              fallback="✕"
              label="Decline"
              color="#FF3B30"
              onPress={() => hangUp('decline')}
            />
            <BigButton
              icon={isVideo ? 'video.fill' : 'phone.fill'}
              fallback="✓"
              label="Accept"
              color="#34C759"
              busy={busy}
              pulse
              onPress={accept}
            />
          </View>
        ) : ended ? null : (
          <>
            <View style={styles.row}>
              <GlassButton
                icon={micMuted ? 'mic.slash.fill' : 'mic.fill'}
                fallback="🎤"
                label={micMuted ? 'Unmute' : 'Mute'}
                active={micMuted}
                onPress={() => {
                  haptics.light();
                  microphone.toggle().catch(() => {});
                }}
              />
              {isVideo ? (
                <GlassButton
                  icon={camMuted ? 'video.slash.fill' : 'video.fill'}
                  fallback="🎥"
                  label="Camera"
                  active={camMuted}
                  onPress={() => {
                    haptics.light();
                    camera.toggle().catch(() => {});
                  }}
                />
              ) : null}
              {isVideo ? (
                <GlassButton
                  icon="camera.rotate"
                  fallback="🔄"
                  label="Flip"
                  disabled={camMuted}
                  onPress={() => {
                    haptics.light();
                    camera.flip().catch(() => {});
                  }}
                />
              ) : null}
              <GlassButton
                icon="speaker.wave.2.fill"
                fallback="🔊"
                label="Speaker"
                active={speaker}
                onPress={toggleSpeaker}
              />
            </View>
            <BigButton
              icon="phone.down.fill"
              fallback="✕"
              label={outgoing ? 'Cancel' : 'End'}
              color="#FF3B30"
              onPress={() => hangUp(outgoing ? 'cancel' : undefined)}
            />
          </>
        )}
      </Animated.View>
    </View>
  );
}

/**
 * Dynamic Island-style pill shown while a call is minimized: who, a live timer, and
 * the mic state. Tap to go back to the call; the red button hangs up.
 */
export function CallPill({ myUid, onExpand }: { myUid: string; onExpand: () => void }) {
  const call = useCall();
  const insets = useSafeAreaInsets();
  const { useCallMembers, useCallStartedAt, useMicrophoneState, useCallCallingState } = useCallStateHooks();
  const members = useCallMembers();
  const startedAt = useCallStartedAt();
  const state = useCallCallingState();
  const { optimisticIsMute: micMuted } = useMicrophoneState();
  const other = members.find((m) => m.user_id !== myUid);
  const profile = useUserProfile(other?.user_id || undefined);
  const name = profile?.name ?? other?.user?.name ?? 'Call';
  const reconnecting = state === CallingState.RECONNECTING || state === CallingState.MIGRATING;
  return (
    <Animated.View
      entering={FadeInUp.springify().damping(16)}
      style={[styles.pillWrap, { top: insets.top + 4 }]}
      pointerEvents="box-none">
      <Pressable
        onPress={() => {
          haptics.light();
          onExpand();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Return to call with ${name}`}
        style={styles.pill}>
        <View style={[styles.pillDot, { backgroundColor: reconnecting ? '#FF9500' : '#34C759' }]} />
        <Avatar id={other?.user_id ?? 'call'} name={name} size={24} uri={profile?.avatarUrl} />
        <Text style={styles.pillName} numberOfLines={1}>
          {name.split(' ')[0]}
        </Text>
        {micMuted ? <Icon name="mic.slash.fill" size={13} color="#FF9F0A" fallback="🔇" /> : null}
        <CallTimer startedAt={startedAt} fallback={reconnecting ? 'Reconnecting…' : 'Connecting…'} />
        <Pressable
          onPress={() => {
            haptics.medium();
            call?.leave().catch(() => {});
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="End call"
          style={styles.pillEnd}>
          <Icon name="phone.down.fill" size={13} color="#fff" fallback="✕" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

function LocalVideo({ participant, style }: { participant: StreamVideoParticipant; style: object }) {
  return (
    <ParticipantView
      participant={participant}
      trackType="videoTrack"
      objectFit="cover"
      mirror
      style={style}
      ParticipantLabel={null}
      ParticipantNetworkQualityIndicator={null}
      ParticipantReaction={null}
    />
  );
}

function PhotoBackdrop({ uri }: { uri: string | null }) {
  if (!uri) return <View style={[StyleSheet.absoluteFill, { backgroundImage: NO_AVATAR_BG }]} />;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
    </View>
  );
}

/** "3:24" since the call started (re-rendered every second). */
function CallTimer({ startedAt, fallback, large }: {
  startedAt: Date | undefined;
  fallback: string | null;
  large?: boolean;
}) {
  const now = useNow(1000);
  const text = startedAt ? formatDuration(Math.max(0, now - startedAt.getTime())) : fallback ?? '';
  return <Text style={large ? styles.status : styles.topStatus}>{text}</Text>;
}

/** Soft rings spreading out from the avatar while it rings. */
function Ripples({ active }: { active: boolean }) {
  return (
    <View style={styles.ripples} pointerEvents="none">
      {active ? [0, 1, 2].map((i) => <Ripple key={i} delay={i * 700} />) : null}
    </View>
  );
}

function Ripple({ delay }: { delay: number }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration: 2100, easing: Easing.out(Easing.quad) }), -1)));
  }, [delay, reduceMotion, t]);
  const style = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.25 : 0.45 * (1 - t.get()),
    transform: [{ scale: 1 + t.get() * 0.9 }],
  }));
  return <Animated.View style={[styles.ripple, style]} />;
}

function GlassButton({ icon, fallback, label, active, disabled, onPress }: {
  icon: IconName;
  fallback: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      style={({ pressed }) => [styles.item, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      <View style={[styles.glass, active && styles.glassActive]}>
        {active ? null : <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />}
        <Icon name={icon} size={24} color={active ? '#000' : '#fff'} fallback={fallback} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

function BigButton({ icon, fallback, label, color, busy, pulse, onPress }: {
  icon: IconName;
  fallback: string;
  label: string;
  color: string;
  busy?: boolean;
  pulse?: boolean;
  onPress: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!pulse || reduceMotion) return;
    t.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [pulse, reduceMotion, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.07 * t.get() }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.item, { opacity: pressed ? 0.75 : 1 }]}>
      <Animated.View style={[styles.big, { backgroundColor: color }, style]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Icon name={icon} size={30} color="#fff" fallback={fallback} />}
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  minimize: {
    position: 'absolute',
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 6,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    maxWidth: '86%',
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillName: { color: '#fff', fontSize: 14, fontWeight: '600', maxWidth: 110 },
  pillEnd: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  scrim: { backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.55) 100%)' },
  center: { alignItems: 'center', gap: 10 },
  ripples: { position: 'absolute', top: 0, left: 0, right: 0, height: 0, alignItems: 'center' },
  ripple: {
    position: 'absolute',
    top: 60 - 8,
    width: 144,
    height: 144,
    borderRadius: 72,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  name: { color: '#fff', fontSize: 32, fontWeight: '700', marginTop: 12, paddingHorizontal: 24, letterSpacing: -0.4 },
  status: { color: 'rgba(255,255,255,0.8)', fontSize: 17, fontWeight: '500', fontVariant: ['tabular-nums'] },
  error: { color: '#FF8A80', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', gap: 2 },
  topName: { color: '#fff', fontSize: 20, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  topStatus: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '500', fontVariant: ['tabular-nums'] },
  pip: {
    position: 'absolute',
    right: 14,
    width: 104,
    height: 150,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: '#222',
  },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 28 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 22, paddingHorizontal: 16 },
  answerRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: 56 },
  item: { alignItems: 'center', gap: 8 },
  glass: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  glassActive: { backgroundColor: '#fff' },
  big: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
  label: { color: '#fff', fontSize: 13, fontWeight: '500' },
});
