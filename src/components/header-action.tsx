import { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Accent } from '@/constants/theme';

type ToolbarIcon = ComponentProps<typeof Stack.Toolbar.Button>['icon'];

export type HeaderButton = {
  /** SF Symbol name. Omit for a text button (e.g. "Cancel"). */
  icon?: ToolbarIcon;
  /** Shown as text when there is no icon, and used for accessibility. */
  label: string;
  onPress: () => void;
  bold?: boolean;
};

/**
 * One or more header buttons on one side. On iOS they are native toolbar items
 * (SF Symbols, Liquid Glass on iOS 26); Stack.Toolbar is not available on web, so
 * there they are drawn as plain buttons.
 */
export function HeaderActions({ placement, buttons }: {
  placement: 'left' | 'right';
  buttons: HeaderButton[];
}) {
  if (Platform.OS === 'web') {
    const render = () => (
      <View style={styles.webRow}>
        {buttons.map((b) => (
          <Pressable
            key={b.label}
            onPress={b.onPress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={b.label}
            style={({ pressed }) => [styles.webButton, { opacity: pressed ? 0.5 : 1 }]}>
            {b.icon ? (
              <Icon name={b.icon as IconName} size={22} color={Accent} fallback={b.label} />
            ) : (
              <Text style={[styles.webText, b.bold && styles.bold]}>{b.label}</Text>
            )}
          </Pressable>
        ))}
      </View>
    );
    return (
      <Stack.Screen
        options={placement === 'left' ? { headerLeft: render } : { headerRight: render }}
      />
    );
  }

  return (
    <Stack.Toolbar placement={placement}>
      {buttons.map((b) => (
        <Stack.Toolbar.Button key={b.label} icon={b.icon} onPress={b.onPress}>
          {b.label}
        </Stack.Toolbar.Button>
      ))}
    </Stack.Toolbar>
  );
}

/** Single header button (see HeaderActions). */
export function HeaderAction({ placement, ...button }: HeaderButton & { placement: 'left' | 'right' }) {
  return <HeaderActions placement={placement} buttons={[button]} />;
}

const styles = StyleSheet.create({
  webRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, gap: 14 },
  webButton: { paddingHorizontal: 4 },
  webText: { color: Accent, fontSize: 17 },
  bold: { fontWeight: '600' },
});
