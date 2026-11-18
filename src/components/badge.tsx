import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** Rounded count pill ("3", "99+"). Renders nothing for 0. */
export function CountBadge({ count, color, style }: {
  count: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: color ?? theme.accent }, style]}>
      <Text style={styles.text}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: '#fff', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
