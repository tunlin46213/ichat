import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

// Soft two-tone pairs (iOS contact style): top and bottom of the circle.
const palette: [string, string][] = [
  ['#5AC8FA', '#007AFF'],
  ['#5EDB82', '#28A745'],
  ['#FF8A80', '#FF3B30'],
  ['#C69CFF', '#8E4EC6'],
  ['#FFB86B', '#FF9500'],
  ['#6FE3D1', '#12A594'],
  ['#FF8CC6', '#D6409F'],
];

function colorsFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

/** Profile photo (or gradient initials) with an optional green "online" dot. */
export function Avatar({ id, name, size = 48, online, uri }: {
  id: string;
  name: string;
  size?: number;
  online?: boolean;
  /** profile photo URL; initials are shown when missing */
  uri?: string | null;
}) {
  const theme = useTheme();
  const [top, bottom] = colorsFor(id);
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    ((words[0]?.[0] ?? '?') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  const dot = Math.max(10, size * 0.26);

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bottom,
            backgroundImage: `linear-gradient(180deg, ${top}, ${bottom})`,
          },
        ]}>
        <Text style={[styles.text, { fontSize: size * (initials.length > 1 ? 0.36 : 0.42) }]}>
          {initials}
        </Text>
        {uri ? (
          <Image
            source={{ uri }}
            style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            accessibilityLabel={name}
          />
        ) : null}
      </View>
      {online ? (
        <View
          accessibilityLabel="Online"
          style={[
            styles.dot,
            {
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              borderColor: theme.background,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '600', letterSpacing: 0.5 },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: '#34C759',
    borderWidth: 2,
  },
});
