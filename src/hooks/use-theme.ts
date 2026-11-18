/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, Semantic } from '@/constants/theme';
import { useAccent } from '@/context/appearance';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Colors for the current scheme, the user's accent color, and semantic colors. */
export function useTheme() {
  const scheme = useColorScheme();
  const accent = useAccent();
  return { ...Colors[scheme], ...Semantic, accent, scheme };
}
