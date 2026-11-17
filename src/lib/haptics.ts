import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Small wrappers so screens don't repeat the platform check or the error handling.
// Haptics are a nice-to-have: failures (or web, which has none) are ignored.
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

function run(fn: () => Promise<void>) {
  if (enabled) fn().catch(() => {});
}

export const haptics = {
  /** light tap: sending a message */
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** medium tap: a swipe action snapping open */
  medium: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
