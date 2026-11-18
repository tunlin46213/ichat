import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';

/** ✓ delivered, ✓✓ read — two overlapping checkmark glyphs like WhatsApp. */
export function ReadTicks({ read, color, size = 15 }: { read: boolean; color: string; size?: number }) {
  return (
    <View
      style={[styles.row, { width: read ? size * 1.45 : size, height: size }]}
      accessibilityLabel={read ? 'Read' : 'Delivered'}>
      <Icon name="checkmark" size={size} color={color} fallback="✓" />
      {read ? (
        <View style={[styles.second, { left: size * 0.45 }]}>
          <Icon name="checkmark" size={size} color={color} fallback="✓" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  second: { position: 'absolute', top: 0 },
});
