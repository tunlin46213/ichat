import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';
import type { ActivityKind } from '@/lib/chat';

/**
 * Header center: avatar (with a ring in their color) over the name, and a live status
 * underneath: "typing" with bouncing dots, "recording voice…", "choosing a photo…",
 * or presence.
 */
export function ChatHeaderTitle({ id, name, status, typing, activity, online, avatarUrl, ringColor }: {
  id: string;
  name: string;
  status: string;
  typing: boolean;
  activity?: ActivityKind | null;
  online: boolean;
  avatarUrl?: string | null;
  /** chat tint, drawn as a thin ring around the avatar */
  ringColor?: string;
}) {
  const theme = useTheme();
  const live = activity ?? (typing ? 'typing' : null);
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <View style={[styles.ring, { borderColor: ringColor ?? 'transparent' }]}>
        <Avatar id={id} name={name} size={30} online={online} uri={avatarUrl} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {name}
        </Text>
        {live ? (
          <Animated.View key={live} entering={FadeIn.duration(150)} style={styles.liveRow}>
            {live === 'typing' ? (
              <Dots color={theme.accent} />
            ) : (
              <Icon
                name={live === 'recording' ? 'mic.fill' : 'photo.fill'}
                size={11}
                color={live === 'recording' ? theme.danger : theme.accent}
                fallback={live === 'recording' ? '🎤' : '📷'}
              />
            )}
            <Text
              style={[styles.status, { color: live === 'recording' ? theme.danger : theme.accent }]}
              numberOfLines={1}>
              {live === 'typing' ? 'typing' : live === 'recording' ? 'recording voice…' : 'choosing a photo…'}
            </Text>
          </Animated.View>
        ) : status ? (
          <Text
            style={[styles.status, { color: online ? theme.success : theme.textSecondary }]}
            numberOfLines={1}>
            {status}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Dots({ color }: { color: string }) {
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} color={color} delay={i * 140} />
      ))}
    </View>
  );
}

function Dot({ color, delay }: { color: string; delay: number }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    y.set(
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(-2.5, { duration: 220, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) }),
            withTiming(0, { duration: 260 })
          ),
          -1
        )
      )
    );
  }, [reduce, delay, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 240 },
  ring: { padding: 1.5, borderRadius: 18, borderWidth: 1.5 },
  text: { flexShrink: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 12 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  status: { fontSize: 12, fontWeight: '500' },
});
