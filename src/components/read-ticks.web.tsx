import Ionicons from '@expo/vector-icons/Ionicons';

/** Web: Ionicons has a real double check ("checkmark-done"). Same props as read-ticks.tsx. */
export function ReadTicks({ read, delivered = false, color, size = 13 }: {
  read: boolean;
  delivered?: boolean;
  color: string;
  size?: number;
}) {
  return (
    <Ionicons
      name={read || delivered ? 'checkmark-done' : 'checkmark'}
      size={size + 4}
      color={color}
      accessibilityLabel={read ? 'Read' : delivered ? 'Delivered' : 'Sent'}
    />
  );
}
