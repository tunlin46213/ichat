import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Text, type ColorValue } from 'react-native';

export type IconName = string;
type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Closest Ionicons (iOS-style set) for the SF Symbols the app uses.
const SF_TO_IONICONS: Record<string, IoniconName> = {
  'bubble.left.and.bubble.right': 'chatbubbles-outline',
  'bubble.left.and.bubble.right.fill': 'chatbubbles',
  gearshape: 'settings-outline',
  'gearshape.fill': 'settings',
  'square.and.pencil': 'create-outline',
  'chevron.right': 'chevron-forward',
  'chevron.left': 'chevron-back',
  'arrow.up': 'arrow-up',
  'rectangle.portrait.and.arrow.right': 'log-out-outline',
  'exclamationmark.circle.fill': 'alert-circle',
  magnifyingglass: 'search',
  'xmark.circle.fill': 'close-circle',
  'trash.fill': 'trash',
  checkmark: 'checkmark',
};

/** Web version of Icon: maps SF Symbol names to Ionicons. Same props as icon.tsx. */
export function Icon({ name, size = 20, color, fallback }: {
  name: string;
  size?: number;
  color: ColorValue;
  fallback: string;
}) {
  const ionicon = SF_TO_IONICONS[name];
  if (ionicon) return <Ionicons name={ionicon} size={size} color={color as string} />;
  return <Text style={{ color, fontSize: size }}>{fallback}</Text>;
}
