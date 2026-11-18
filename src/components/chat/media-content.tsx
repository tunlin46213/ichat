import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loadMediaUri } from '@/lib/media';

/** Loads a stored photo / voice note (cached after the first load). */
export function useMediaUri(chatId: string, mediaId: string, mime: string) {
  const [state, setState] = useState<{ key: string; uri: string | null; failed: boolean }>({
    key: '',
    uri: null,
    failed: false,
  });
  const key = `${chatId}/${mediaId}`;
  useEffect(() => {
    let active = true;
    loadMediaUri(chatId, mediaId, mime).then(
      (uri) => active && setState({ key, uri, failed: false }),
      () => active && setState({ key, uri: null, failed: true })
    );
    return () => {
      active = false;
    };
  }, [chatId, mediaId, mime, key]);
  return state.key === key ? state : { uri: null, failed: false };
}

const MAX_W = 240;
const MAX_H = 320;

/** Photo inside a chat bubble, sized to its aspect ratio. Tap for the full-screen viewer. */
export function ImageContent({ chatId, mediaId, mime, width, height, onLongPress, onOpen }: {
  chatId: string;
  mediaId: string;
  mime: string;
  width?: number;
  height?: number;
  onLongPress: () => void;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const { uri, failed } = useMediaUri(chatId, mediaId, mime);
  const ratio = width && height ? width / height : 4 / 3;
  const w = ratio >= MAX_W / MAX_H ? MAX_W : MAX_H * ratio;
  const h = w / ratio;
  return (
    <>
      <Pressable
        onPress={() => uri && onOpen()}
        onLongPress={onLongPress}
        delayLongPress={280}
        accessibilityLabel="Photo, tap to view">
        {uri ? (
          <Image
            source={{ uri }}
            style={{ width: w, height: h, borderRadius: 16 }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View
            style={[styles.placeholder, { width: w, height: h, backgroundColor: theme.backgroundElement }]}>
            {failed ? (
              <Text style={{ color: theme.textSecondary }}>Photo unavailable</Text>
            ) : (
              <ActivityIndicator />
            )}
          </View>
        )}
      </Pressable>
    </>
  );
}

function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const BARS = 28;
const SPEEDS = [1, 1.5, 2] as const;

/** Bar heights (6–20 pt): the recorded loudness when we have it, else a stable pattern. */
function barHeights(waveform: number[] | undefined) {
  return Array.from({ length: BARS }, (_, i) => {
    if (waveform?.length) {
      const level = waveform[Math.floor((i / BARS) * waveform.length)] ?? 0;
      return 4 + Math.max(0, Math.min(1, level)) * 18;
    }
    return 6 + ((Math.sin(i * 1.7) + Math.sin(i * 0.6 + 1)) * 0.5 + 1) * 7;
  });
}

/** Voice message: play/pause, waveform progress, time, and playback speed. */
export function AudioContent({ chatId, mediaId, mime, durationMs, waveform, mine }: {
  chatId: string;
  mediaId: string;
  mime: string;
  durationMs?: number;
  /** loudness per bar (0–1) saved when it was recorded */
  waveform?: number[];
  mine: boolean;
}) {
  const theme = useTheme();
  const { uri, failed } = useMediaUri(chatId, mediaId, mime);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const heights = barHeights(waveform);

  // Once the voice note stops, let the silent switch mute app sounds again (the
  // new-message chime should stay quiet in silent mode, like a notification).
  const finished = status.didJustFinish;
  useEffect(() => {
    if (finished) setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});
  }, [finished]);
  const total = status.duration || (durationMs ?? 0) / 1000;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;
  const fg = mine ? '#fff' : theme.text;
  const dim = mine ? 'rgba(255,255,255,0.45)' : theme.textSecondary;

  function toggle() {
    if (!uri) return;
    if (status.playing) {
      player.pause();
      setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});
      return;
    }
    if (status.didJustFinish || progress >= 1) player.seekTo(0);
    // iOS mutes playback when the ring/silent switch is on unless we opt out. It was only
    // set after recording, so voice messages were silent on a fresh launch. This also
    // restores the speaker after a call (WebRTC leaves the session in voice-chat mode).
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })
      .catch(() => {})
      .finally(() => {
        player.setPlaybackRate(speed);
        player.play();
      });
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    player.setPlaybackRate(next);
  }

  return (
    <View style={styles.audio}>
      <Pressable
        onPress={toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'}
        disabled={!uri}
        style={[styles.play, { backgroundColor: mine ? 'rgba(255,255,255,0.25)' : Accent }]}>
        {uri ? (
          <Icon name={status.playing ? 'pause.fill' : 'play.fill'} size={14} color="#fff" fallback={status.playing ? '❚❚' : '▶'} />
        ) : failed ? (
          <Text style={styles.failed}>!</Text>
        ) : (
          <ActivityIndicator size="small" color="#fff" />
        )}
      </Pressable>
      <View style={styles.wave}>
        {heights.map((h, i) => (
          <View
            key={i}
            style={[styles.bar, { height: h, backgroundColor: i / BARS < progress ? fg : dim }]}
          />
        ))}
      </View>
      <View style={styles.side}>
        <Text style={[styles.time, { color: fg }]}>
          {formatDuration(status.playing || status.currentTime > 0 ? status.currentTime : total)}
        </Text>
        <Pressable
          onPress={cycleSpeed}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Playback speed ${speed}x`}
          style={[styles.speed, { backgroundColor: mine ? 'rgba(255,255,255,0.22)' : theme.backgroundSelected }]}>
          <Text style={[styles.speedText, { color: fg }]}>{speed}×</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  failed: { color: '#fff', fontWeight: '700' },
  audio: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210 },
  play: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 },
  bar: { width: 3, borderRadius: 2 },
  side: { alignItems: 'flex-end', gap: 3 },
  time: { fontSize: 13, fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'right' },
  speed: { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  speedText: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
