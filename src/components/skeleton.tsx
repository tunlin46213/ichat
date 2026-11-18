import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Placeholder rows with a light sweeping across, shown while a list loads. */
export function SkeletonRows({ count = 6, avatarSize = 52, lines = 2 }: {
  count?: number;
  avatarSize?: number;
  lines?: 1 | 2;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    sweep.set(withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, false));
  }, [sweep, reduce]);

  const shine = useAnimatedStyle(() => ({
    transform: [{ translateX: -width + sweep.get() * width * 2 }],
  }));
  const fill = { backgroundColor: theme.backgroundElement };
  const light = theme.scheme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.65)';

  return (
    <View style={styles.wrap} accessibilityLabel="Loading">
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shine,
          { width, backgroundImage: `linear-gradient(100deg, transparent 20%, ${light} 50%, transparent 80%)` },
          shine,
        ]}
      />
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          <View
            style={[fill, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
          />
          <View style={styles.body}>
            <View style={[fill, styles.line, { width: `${45 + ((i * 17) % 30)}%` }]} />
            {lines === 2 ? (
              <View style={[fill, styles.line, styles.short, { width: `${60 + ((i * 23) % 30)}%` }]} />
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  shine: { position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.three, gap: 12 },
  body: {
    flex: 1,
    minHeight: 76,
    justifyContent: 'center',
    gap: 8,
    paddingRight: Spacing.three,
  },
  line: { height: 12, borderRadius: 6 },
  short: { height: 10 },
});
