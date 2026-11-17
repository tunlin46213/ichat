import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Accent } from '@/constants/theme';

/** Rounded count pill ("3", "99+"). Renders nothing for 0. */
export function CountBadge({ count, color = Accent, style }: {
  count: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: color }, style]}>
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
