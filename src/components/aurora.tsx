import { StyleSheet, View } from 'react-native';

import { timeOfDayColors } from '@/context/appearance';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';

/**
 * Soft "aurora" glow behind a screen's top area: the accent color plus two colors that
 * follow the time of day (sunrise, sky, sunset, night). Place it first inside a
 * full-screen container.
 */
export function AuroraBackground({ height = 420 }: { height?: number }) {
  const theme = useTheme();
  const now = useNow(5 * 60_000);
  const [warm, cool] = timeOfDayColors(new Date(now).getHours());
  const dark = theme.scheme === 'dark';
  const a = dark ? '55' : '40'; // accent alpha (hex)
  const p = dark ? '38' : '30'; // time-of-day alpha
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.glow,
          {
            height,
            backgroundImage: [
              `radial-gradient(circle at 15% 0%, ${theme.accent}${a} 0%, ${theme.accent}00 55%)`,
              `radial-gradient(circle at 95% 10%, ${warm}${p} 0%, ${warm}00 50%)`,
              `radial-gradient(circle at 55% 40%, ${cool}${p} 0%, ${cool}00 55%)`,
            ].join(', '),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, left: 0, right: 0 },
});
