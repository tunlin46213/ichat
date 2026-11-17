import { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { Accent } from '@/constants/theme';

type ToolbarIcon = ComponentProps<typeof Stack.Toolbar.Button>['icon'];

/**
 * A header button. On iOS it is a native toolbar item (SF Symbol, Liquid Glass on iOS 26);
 * Stack.Toolbar is not available on web, so there it falls back to a text button.
 */
export function HeaderAction({ placement, icon, label, onPress, bold }: {
  placement: 'left' | 'right';
  /** SF Symbol name. Omit for a text button (e.g. "Cancel"). */
  icon?: ToolbarIcon;
  /** Shown as text when there is no icon, and used for accessibility. */
  label: string;
  onPress: () => void;
  bold?: boolean;
}) {
  if (Platform.OS === 'web') {
    const render = () => (
      <Pressable onPress={onPress} hitSlop={10} style={styles.webButton}>
        <Text style={[styles.webText, bold && styles.bold]}>{label}</Text>
      </Pressable>
    );
    return (
      <Stack.Screen
        options={placement === 'left' ? { headerLeft: render } : { headerRight: render }}
      />
    );
  }

  return (
    <Stack.Toolbar placement={placement}>
      <Stack.Toolbar.Button icon={icon} onPress={onPress}>
        {label}
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}

const styles = StyleSheet.create({
  webButton: { marginHorizontal: 12, paddingHorizontal: 4 },
  webText: { color: Accent, fontSize: 17 },
  bold: { fontWeight: '600' },
});
