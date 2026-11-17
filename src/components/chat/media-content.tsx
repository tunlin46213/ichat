import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loadMediaUri } from '@/lib/media';

/** Loads a stored photo / voice note (cached after the first load). */
function useMediaUri(chatId: string, mediaId: string, mime: string) {
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

/** Photo inside a chat bubble, sized to its aspect ratio. Tap for full screen. */
export function ImageContent({ chatId, mediaId, mime, width, height, onLongPress }: {
  chatId: string;
  mediaId: string;
  mime: string;
  width?: number;
  height?: number;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const { uri, failed } = useMediaUri(chatId, mediaId, mime);
  const [open, setOpen] = useState(false);
  const ratio = width && height ? width / height : 4 / 3;
  const w = ratio >= MAX_W / MAX_H ? MAX_W : MAX_H * ratio;
  const h = w / ratio;
  return (
    <>
      <Pressable
        onPress={() => uri && setOpen(true)}
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
      {open && uri ? <ImageViewer uri={uri} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ImageViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn} style={styles.viewer}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close photo" />
        <Image source={{ uri }} style={styles.full} contentFit="contain" pointerEvents="none" />
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="Close"
          style={[styles.close, { top: insets.top + 12 }]}>
          <Icon name="xmark" size={20} color="#fff" fallback="✕" />
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const BARS = 28;

/** Voice message: play/pause, waveform-style progress, and time. */
export function AudioContent({ chatId, mediaId, mime, durationMs, mine }: {
  chatId: string;
  mediaId: string;
  mime: string;
  durationMs?: number;
  mine: boolean;
}) {
  const theme = useTheme();
  const { uri, failed } = useMediaUri(chatId, mediaId, mime);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  const total = status.duration || (durationMs ?? 0) / 1000;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;
  const fg = mine ? '#fff' : theme.text;
  const dim = mine ? 'rgba(255,255,255,0.45)' : theme.textSecondary;

  function toggle() {
    if (!uri) return;
    if (status.playing) return player.pause();
    if (status.didJustFinish || progress >= 1) player.seekTo(0);
    player.play();
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
        {Array.from({ length: BARS }, (_, i) => {
          // Deterministic pseudo-waveform so each bubble looks natural but stable.
          const h = 6 + ((Math.sin(i * 1.7) + Math.sin(i * 0.6 + 1)) * 0.5 + 1) * 7;
          return (
            <View
              key={i}
              style={[styles.bar, { height: h, backgroundColor: i / BARS < progress ? fg : dim }]}
            />
          );
        })}
      </View>
      <Text style={[styles.time, { color: fg }]}>
        {formatDuration(status.playing || status.currentTime > 0 ? status.currentTime : total)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  failed: { color: '#fff', fontWeight: '700' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
  close: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audio: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210 },
  play: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 },
  bar: { width: 3, borderRadius: 2 },
  time: { fontSize: 13, fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'right' },
});
