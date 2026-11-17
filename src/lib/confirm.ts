import { Alert, Platform } from 'react-native';

/**
 * iOS action alert with a destructive button. Alert.alert has no buttons on web,
 * so the browser's confirm dialog is used there.
 */
export function confirmDestructive(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${opts.title}\n\n${opts.message}`)) opts.onConfirm();
    return;
  }
  Alert.alert(opts.title, opts.message, [
    { text: 'Cancel', style: 'cancel' },
    { text: opts.confirmLabel, style: 'destructive', onPress: opts.onConfirm },
  ]);
}
