/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    // iOS system palette (grouped lists, cards, hairlines, incoming bubbles)
    groupedBackground: '#F2F2F7',
    card: '#FFFFFF',
    separator: '#C6C6C8',
    bubbleIncoming: '#E9E9EB',
    pinnedRow: '#F6F6F9',
    // Frosted "glass" surfaces over the aurora background
    glass: 'rgba(255,255,255,0.72)',
    glassStrong: 'rgba(255,255,255,0.88)',
    glassBorder: 'rgba(255,255,255,0.9)',
    glassHairline: 'rgba(0,0,0,0.06)',
    /** nearly opaque card (rows that slide over swipe actions) */
    glassCard: 'rgba(255,255,255,0.86)',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    groupedBackground: '#000000',
    card: '#1C1C1E',
    separator: '#38383A',
    bubbleIncoming: '#26252A',
    pinnedRow: '#111113',
    glass: 'rgba(255,255,255,0.055)',
    glassStrong: 'rgba(255,255,255,0.09)',
    glassBorder: 'rgba(255,255,255,0.08)',
    glassHairline: 'rgba(255,255,255,0.06)',
    glassCard: 'rgba(30,30,36,0.92)',
  },
} as const;

/** Brand color for primary buttons and the user's own chat bubbles. */
export const Accent = '#208AEF';

// ── Design tokens ──────────────────────────────────────────────────────────────
// Use these instead of one-off numbers so every screen shares one visual language.

/** Status colors (iOS system palette), same in light and dark. */
export const Semantic = {
  danger: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
  info: '#0A84FF',
} as const;

/** Corner radii. */
export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/** iOS text styles (Dynamic Type "Large" sizes). */
export const Type = {
  largeTitle: { fontSize: 34, fontWeight: '800', letterSpacing: -0.6 },
  title1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
  title2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  title3: { fontSize: 20, fontWeight: '600' },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 17 },
  callout: { fontSize: 16 },
  subhead: { fontSize: 15 },
  footnote: { fontSize: 13 },
  caption: { fontSize: 12 },
  sectionHeader: { fontSize: 13, fontWeight: '500', letterSpacing: 0.3, textTransform: 'uppercase' },
} as const;

/** Shadows (CSS box-shadow, supported on iOS, Android and web). */
export const Elevation = {
  none: undefined,
  card: '0 1px 2px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.05)',
  raised: '0 6px 20px rgba(0,0,0,0.12)',
  floating: '0 12px 32px rgba(0,0,0,0.25)',
} as const;

/** Motion durations (ms) and springs. */
export const Motion = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: { damping: 18, stiffness: 220 },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
