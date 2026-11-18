import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

function Dot({ delay }: { delay: number }) {
  const theme = useTheme();
  const lift = useSharedValue(0);

  useEffect(() => {
    lift.set(
      withDelay(
        delay,
        withRepeat(
          withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 })),
          -1
        )
      )
    );
  }, [delay, lift]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + lift.get() * 0.6,
    transform: [{ translateY: -lift.get() * 3 }],
  }));

  return <Animated.View style={[styles.dot, { backgroundColor: theme.textSecondary }, style]} />;
}

/** Incoming "• • •" bubble shown while the other person is typing. */
export function TypingBubble() {
  const theme = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.row}
      accessibilityLabel="Typing">
      <View style={[styles.bubble, { backgroundColor: theme.bubbleIncoming }]}>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Indented past the avatar column of incoming messages.
  row: { flexDirection: 'row', marginTop: 8, marginBottom: 2, marginLeft: 34 },
  bubble: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 18,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
