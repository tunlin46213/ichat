import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { Accent } from '@/constants/theme';

/** Colors for my own chat bubbles. */
export const BUBBLE_COLORS = [
  { id: 'blue', name: 'Blue', color: Accent },
  { id: 'purple', name: 'Purple', color: '#8E4EC6' },
  { id: 'pink', name: 'Pink', color: '#D6409F' },
  { id: 'red', name: 'Red', color: '#E5484D' },
  { id: 'orange', name: 'Orange', color: '#F76B15' },
  { id: 'green', name: 'Green', color: '#30A46C' },
  { id: 'teal', name: 'Teal', color: '#12A594' },
  { id: 'graphite', name: 'Graphite', color: '#5B5F66' },
] as const;

/** Chat backgrounds: a light and a dark CSS gradient each (null = plain). */
export const WALLPAPERS = [
  { id: 'none', name: 'None', light: null, dark: null },
  {
    id: 'sky',
    name: 'Sky',
    light: 'linear-gradient(180deg, #E8F2FF 0%, #F7FBFF 100%)',
    dark: 'linear-gradient(180deg, #0B1A2E 0%, #000000 100%)',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    light: 'linear-gradient(180deg, #FFE9E0 0%, #FFF6F0 100%)',
    dark: 'linear-gradient(180deg, #2A1410 0%, #0A0505 100%)',
  },
  {
    id: 'forest',
    name: 'Forest',
    light: 'linear-gradient(180deg, #E4F5EA 0%, #F6FCF8 100%)',
    dark: 'linear-gradient(180deg, #0D2116 0%, #020805 100%)',
  },
  {
    id: 'lavender',
    name: 'Lavender',
    light: 'linear-gradient(180deg, #F1E9FF 0%, #FBF8FF 100%)',
    dark: 'linear-gradient(180deg, #1C1230 0%, #07040C 100%)',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    light: 'linear-gradient(160deg, #DFF7F3 0%, #EDE8FF 55%, #FFE8F3 100%)',
    dark: 'linear-gradient(160deg, #06221F 0%, #140F2B 55%, #26091A 100%)',
  },
] as const;

export type BubbleColorId = (typeof BUBBLE_COLORS)[number]['id'];
export type WallpaperId = (typeof WALLPAPERS)[number]['id'];

type Saved = { bubble: BubbleColorId; wallpaper: WallpaperId };

type AppearanceValue = Saved & {
  /** hex color of my bubbles */
  bubbleColor: string;
  setBubble: (id: BubbleColorId) => void;
  setWallpaper: (id: WallpaperId) => void;
};

const STORAGE_KEY = 'ichat.appearance.v1';
const DEFAULTS: Saved = { bubble: 'blue', wallpaper: 'none' };

const AppearanceContext = createContext<AppearanceValue | null>(null);

/** Per-device look of the chat screen (kept on this phone only). */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Saved>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(
      (raw) => {
        if (!raw) return;
        try {
          const value = JSON.parse(raw) as Partial<Saved>;
          setSaved({
            bubble: BUBBLE_COLORS.some((c) => c.id === value.bubble) ? value.bubble! : DEFAULTS.bubble,
            wallpaper: WALLPAPERS.some((w) => w.id === value.wallpaper)
              ? value.wallpaper!
              : DEFAULTS.wallpaper,
          });
        } catch {
          // Corrupt value: keep the defaults.
        }
      },
      () => {}
    );
  }, []);

  function update(patch: Partial<Saved>) {
    setSaved((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  const bubbleColor = BUBBLE_COLORS.find((c) => c.id === saved.bubble)?.color ?? Accent;

  return (
    <AppearanceContext
      value={{
        ...saved,
        bubbleColor,
        setBubble: (bubble) => update({ bubble }),
        setWallpaper: (wallpaper) => update({ wallpaper }),
      }}>
      {children}
    </AppearanceContext>
  );
}

export function useAppearance() {
  const ctx = use(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used inside <AppearanceProvider>');
  return ctx;
}

/** CSS gradient for the current wallpaper in this color scheme, or null. */
export function wallpaperGradient(id: WallpaperId, scheme: 'light' | 'dark') {
  const w = WALLPAPERS.find((x) => x.id === id);
  return (scheme === 'dark' ? w?.dark : w?.light) ?? null;
}
