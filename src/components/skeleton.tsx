import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Gently pulsing placeholder rows, shown while a list loads (instead of a spinner). */
export function SkeletonRows({ count = 6, avatarSize = 52, lines = 2 }: {
  count?: number;
  avatarSize?: number;
  lines?: 1 | 2;
}) {
  const theme = useTheme();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.set(withRepeat(withTiming(1, { duration: 800 }), -1, true));
  }, [opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const fill = { backgroundColor: theme.backgroundElement };

  return (
    <Animated.View style={pulse} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          <View
            style={[fill, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
          />
          <View style={[styles.body, { borderBottomColor: theme.separator }]}>
            <View style={[fill, styles.line, { width: `${45 + ((i * 17) % 30)}%` }]} />
            {lines === 2 ? (
              <View style={[fill, styles.line, styles.short, { width: `${60 + ((i * 23) % 30)}%` }]} />
            ) : null}
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.three, gap: 12 },
  body: {
    flex: 1,
    minHeight: 76,
    justifyContent: 'center',
    gap: 8,
    paddingRight: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  line: { height: 12, borderRadius: 6 },
  short: { height: 10 },
});
