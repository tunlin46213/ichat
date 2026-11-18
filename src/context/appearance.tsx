import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { Appearance, Platform, useColorScheme as useSystemColorScheme } from 'react-native';

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
  // Drawn from the accent color at runtime (see wallpaperGradient).
  { id: 'glow', name: 'Glow', light: null, dark: null },
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

/** Light / dark, or follow the phone. */
export const COLOR_MODES = ['system', 'light', 'dark'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

/** Message text sizes (multiplier on the base font sizes). */
export const TEXT_SIZES = [
  { id: 'xs', label: 'XS', scale: 0.88 },
  { id: 's', label: 'S', scale: 0.94 },
  { id: 'm', label: 'M', scale: 1 },
  { id: 'l', label: 'L', scale: 1.12 },
  { id: 'xl', label: 'XL', scale: 1.25 },
] as const;
export type TextSizeId = (typeof TEXT_SIZES)[number]['id'];

/** Per-chat overrides (missing = use the app-wide setting). */
export type ChatPrefs = { bubble?: BubbleColorId; wallpaper?: WallpaperId; muted?: boolean };

type Saved = {
  /** also the app's accent color (buttons, links, tabs) */
  bubble: BubbleColorId;
  wallpaper: WallpaperId;
  colorMode: ColorMode;
  textSize: TextSizeId;
  chats: Record<string, ChatPrefs>;
};

type AppearanceValue = Omit<Saved, 'chats'> & {
  /** hex color of my bubbles */
  bubbleColor: string;
  /** app-wide accent (the chosen color, ignoring per-chat bubble overrides) */
  accent: string;
  /** multiplier for message/list text */
  textScale: number;
  setColorMode: (mode: ColorMode) => void;
  setTextSize: (id: TextSizeId) => void;
  setBubble: (id: BubbleColorId) => void;
  setWallpaper: (id: WallpaperId) => void;
  /** overrides saved for one chat ({} when none) */
  chatPrefs: (chatId: string) => ChatPrefs;
  /** Merges into a chat's overrides; a key set to undefined goes back to the default. */
  setChatPrefs: (chatId: string, patch: ChatPrefs) => void;
};

const STORAGE_KEY = 'ichat.appearance.v1';
const DEFAULTS: Saved = { bubble: 'blue', wallpaper: 'glow', colorMode: 'system', textSize: 'm', chats: {} };

const isBubble = (v: unknown): v is BubbleColorId => BUBBLE_COLORS.some((c) => c.id === v);
const isWallpaper = (v: unknown): v is WallpaperId => WALLPAPERS.some((w) => w.id === v);
const isColorMode = (v: unknown): v is ColorMode => COLOR_MODES.includes(v as ColorMode);
const isTextSize = (v: unknown): v is TextSizeId => TEXT_SIZES.some((t) => t.id === v);

function cleanChats(raw: unknown): Record<string, ChatPrefs> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, ChatPrefs> = {};
  for (const [id, value] of Object.entries(raw as Record<string, Partial<ChatPrefs>>)) {
    const prefs: ChatPrefs = {};
    if (isBubble(value?.bubble)) prefs.bubble = value.bubble;
    if (isWallpaper(value?.wallpaper)) prefs.wallpaper = value.wallpaper;
    if (value?.muted === true) prefs.muted = true;
    if (Object.keys(prefs).length) out[id] = prefs;
  }
  return out;
}

const AppearanceContext = createContext<AppearanceValue | null>(null);

const colorOf = (id: BubbleColorId) => BUBBLE_COLORS.find((c) => c.id === id)?.color ?? Accent;

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
            bubble: isBubble(value.bubble) ? value.bubble : DEFAULTS.bubble,
            wallpaper: isWallpaper(value.wallpaper) ? value.wallpaper : DEFAULTS.wallpaper,
            colorMode: isColorMode(value.colorMode) ? value.colorMode : DEFAULTS.colorMode,
            textSize: isTextSize(value.textSize) ? value.textSize : DEFAULTS.textSize,
            chats: cleanChats(value.chats),
          });
        } catch {
          // Corrupt value: keep the defaults.
        }
      },
      () => {}
    );
  }, []);

  // Native: also switch system UI (tab bar, alerts, keyboard, status bar) to the mode.
  const mode = saved.colorMode;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
    } catch {
      // Older runtime: our own screens still follow the choice.
    }
  }, [mode]);

  function update(change: (prev: Saved) => Saved) {
    setSaved((prev) => {
      const next = change(prev);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  function setChatPrefs(chatId: string, patch: ChatPrefs) {
    update((prev) => {
      const merged: Record<string, unknown> = { ...prev.chats[chatId], ...patch };
      for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
      const chats = { ...prev.chats };
      if (Object.keys(merged).length) chats[chatId] = merged as ChatPrefs;
      else delete chats[chatId];
      return { ...prev, chats };
    });
  }

  return (
    <AppearanceContext
      value={{
        bubble: saved.bubble,
        wallpaper: saved.wallpaper,
        colorMode: saved.colorMode,
        textSize: saved.textSize,
        bubbleColor: colorOf(saved.bubble),
        accent: colorOf(saved.bubble),
        textScale: TEXT_SIZES.find((t) => t.id === saved.textSize)?.scale ?? 1,
        setColorMode: (colorMode) => update((prev) => ({ ...prev, colorMode })),
        setTextSize: (textSize) => update((prev) => ({ ...prev, textSize })),
        setBubble: (bubble) => update((prev) => ({ ...prev, bubble })),
        setWallpaper: (wallpaper) => update((prev) => ({ ...prev, wallpaper })),
        chatPrefs: (chatId) => saved.chats[chatId] ?? {},
        setChatPrefs,
      }}>
      {children}
    </AppearanceContext>
  );
}

/**
 * Inside one chat: everything below sees that chat's own bubble color and wallpaper
 * (if it has any) as the current appearance.
 */
export function ChatAppearanceScope({ chatId, children }: { chatId: string; children: ReactNode }) {
  const parent = useAppearance();
  const prefs = parent.chatPrefs(chatId);
  const bubble = prefs.bubble ?? parent.bubble;
  return (
    <AppearanceContext
      value={{
        ...parent,
        bubble,
        wallpaper: prefs.wallpaper ?? parent.wallpaper,
        bubbleColor: colorOf(bubble),
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

/**
 * Two glow colors that follow the time of day: warm sunrise in the morning, sky and
 * mint by day, sunset in the evening, indigo and violet at night.
 */
export function timeOfDayColors(hour: number): [string, string] {
  if (hour >= 5 && hour < 10) return ['#FF9F43', '#FF6CAB'];
  if (hour >= 10 && hour < 16) return ['#5AC8FA', '#30D158'];
  if (hour >= 16 && hour < 20) return ['#FF6CAB', '#FF8A3D'];
  return ['#5E5CE6', '#8E4EC6'];
}

/**
 * CSS gradient for a wallpaper in this color scheme, or null. "Glow" is drawn from the
 * accent, an optional chat tint (the contact's color) and the time of day.
 */
export function wallpaperGradient(
  id: WallpaperId,
  scheme: 'light' | 'dark',
  { accent = Accent, tint, hour = 12 }: { accent?: string; tint?: string; hour?: number } = {}
) {
  if (id === 'glow') {
    const a = scheme === 'dark' ? '4D' : '33';
    const b = scheme === 'dark' ? '38' : '26';
    const [warm, cool] = timeOfDayColors(hour);
    return [
      `radial-gradient(circle at 0% 0%, ${accent}${a} 0%, ${accent}00 45%)`,
      `radial-gradient(circle at 100% 35%, ${tint ?? warm}${b} 0%, ${tint ?? warm}00 42%)`,
      `radial-gradient(circle at 20% 100%, ${cool}${b} 0%, ${cool}00 48%)`,
    ].join(', ');
  }
  const w = WALLPAPERS.find((x) => x.id === id);
  return (scheme === 'dark' ? w?.dark : w?.light) ?? null;
}

/**
 * Current color scheme: the user's choice in Appearance, or the phone's setting.
 * Use this instead of react-native's useColorScheme everywhere in the app.
 */
export function useResolvedColorScheme(): 'light' | 'dark' {
  const system = useSystemColorScheme();
  const ctx = use(AppearanceContext);
  const mode = ctx?.colorMode ?? 'system';
  if (mode !== 'system') return mode;
  return system === 'dark' ? 'dark' : 'light';
}

/** App accent color (falls back to the brand blue outside the provider). */
export function useAccent() {
  return use(AppearanceContext)?.accent ?? Accent;
}
