import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';

/** ✓ sent, ✓✓ delivered (dim) / read (colored) — overlapping checkmarks like WhatsApp. */
export function ReadTicks({ read, delivered = false, color, size = 15 }: {
  read: boolean;
  delivered?: boolean;
  color: string;
  size?: number;
}) {
  const double = read || delivered;
  return (
    <View
      style={[styles.row, { width: double ? size * 1.45 : size, height: size }]}
      accessibilityLabel={read ? 'Read' : delivered ? 'Delivered' : 'Sent'}>
      <Icon name="checkmark" size={size} color={color} fallback="✓" />
      {double ? (
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
