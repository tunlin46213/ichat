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
  phone: 'call-outline',
  'phone.fill': 'call',
  video: 'videocam-outline',
  'arrowshape.turn.up.left': 'arrow-undo-outline',
  'doc.on.doc': 'copy-outline',
  'arrow.uturn.backward.circle': 'arrow-undo-circle-outline',
  'chevron.down': 'chevron-down',
  xmark: 'close',
  pencil: 'pencil',
  'person.crop.circle.badge.xmark': 'person-remove-outline',
  'lock.shield': 'shield-checkmark-outline',
  'checkmark.circle.fill': 'checkmark-circle',
  'hand.raised.fill': 'hand-left',
  'exclamationmark.bubble.fill': 'alert-circle',
  'pencil.line': 'create-outline',
  'doc.text': 'document-text-outline',
  'nosign': 'ban-outline',
  'photo': 'image-outline',
  'photo.fill': 'image',
  'camera.fill': 'camera',
  'mic.fill': 'mic',
  'play.fill': 'play',
  'pause.fill': 'pause',
  'stop.fill': 'stop',
  plus: 'add',
  'bell.fill': 'notifications',
  'phone.down.fill': 'call',
  'mic.slash.fill': 'mic-off',
  'speaker.wave.2.fill': 'volume-high',
  'video.fill': 'videocam',
  'mappin.circle.fill': 'location',
  'location.fill': 'navigate',
  star: 'star-outline',
  'star.fill': 'star',
  'star.slash': 'star-outline',
  pin: 'pin-outline',
  'pin.fill': 'pin',
  'pin.slash': 'pin-outline',
  'arrowshape.turn.up.right': 'arrow-redo-outline',
  'arrowshape.turn.up.right.fill': 'arrow-redo',
  'paintbrush.fill': 'color-palette',
  'photo.on.rectangle': 'images-outline',
  'checkmark.circle': 'checkmark-circle-outline',
  'square.and.arrow.down': 'download-outline',
  'face.smiling': 'happy-outline',
  'keyboard': 'keypad-outline',
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
