import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Text, type ColorValue } from 'react-native';

export type IconName = Extract<ComponentProps<typeof SymbolView>['name'], string>;

/**
 * SF Symbol on iOS. Elsewhere (web/Android) shows `fallback`, a plain text glyph,
 * so the UI still works in the browser.
 */
export function Icon({ name, size = 20, color, fallback }: {
  name: IconName;
  size?: number;
  color: ColorValue;
  fallback: string;
}) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      fallback={<Text style={{ color, fontSize: size, lineHeight: size * 1.15 }}>{fallback}</Text>}
    />
  );
}
