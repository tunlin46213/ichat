import Ionicons from '@expo/vector-icons/Ionicons';

/** Web: Ionicons has a real double check ("checkmark-done"). Same props as read-ticks.tsx. */
export function ReadTicks({ read, color, size = 13 }: { read: boolean; color: string; size?: number }) {
  return (
    <Ionicons
      name={read ? 'checkmark-done' : 'checkmark'}
      size={size + 4}
      color={color}
      accessibilityLabel={read ? 'Read' : 'Delivered'}
    />
  );
}
