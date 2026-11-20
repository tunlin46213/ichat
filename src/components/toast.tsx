import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOutUp, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { Icon, type IconName } from '@/components/icon';
import { Elevation, Radius, Semantic } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

export type ToastKind = 'success' | 'error' | 'info';

type ToastData = { id: number; text: string; kind: ToastKind; icon?: IconName };
type Listener = (toast: ToastData) => void;

const listeners = new Set<Listener>();
let nextId = 1;

const DEFAULT_ICON: Record<ToastKind, { icon: IconName; fallback: string }> = {
  success: { icon: 'checkmark.circle.fill', fallback: '✓' },
  error: { icon: 'exclamationmark.circle.fill', fallback: '!' },
  info: { icon: 'info.circle.fill', fallback: 'i' },
};

/**
 * Small notice that slides down from the top and goes away by itself — for quick
 * confirmations ("Copied", "Pinned") and non-blocking errors, instead of an alert.
 */
export const toast = {
  show(text: string, kind: ToastKind = 'info', icon?: IconName) {
    const data = { id: nextId++, text, kind, icon };
    if (kind === 'error') haptics.error();
    else if (kind === 'success') haptics.success();
    listeners.forEach((listener) => listener(data));
  },
  success(text: string, icon?: IconName) {
    toast.show(text, 'success', icon);
  },
  error(text: string, icon?: IconName) {
    toast.show(text, 'error', icon);
  },
  info(text: string, icon?: IconName) {
    toast.show(text, 'info', icon);
  },
};

const SHOW_MS = 2200;

/** Renders the current toast. Mount once, above the app. */
export function ToastHost() {
  const [current, setCurrent] = useState<ToastData | null>(null);

  useEffect(() => {
    const listener: Listener = (data) => setCurrent(data);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const currentId = current?.id;
  useEffect(() => {
    if (!currentId) return;
    const timer = setTimeout(() => setCurrent((c) => (c?.id === currentId ? null : c)), SHOW_MS);
    return () => clearTimeout(timer);
  }, [currentId]);

  if (!current) return null;
  // iOS: native modal screens (New Moment, New Chat…) sit above the root view, so a plain
  // overlay would hide behind them. FullWindowOverlay draws in its own window on top.
  if (Platform.OS === 'ios') {
    return (
      <FullWindowOverlay>
        <ToastView key={current.id} toast={current} />
      </FullWindowOverlay>
    );
  }
  return <ToastView key={current.id} toast={current} />;
}

function ToastView({ toast: data }: { toast: ToastData }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const color =
    data.kind === 'error' ? Semantic.danger : data.kind === 'success' ? Semantic.success : theme.accent;
  const icon = data.icon ?? DEFAULT_ICON[data.kind].icon;
  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="none">
      <Animated.View
        entering={SlideInUp.springify().damping(18)}
        exiting={FadeOutUp.duration(200)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.pill, { borderColor: theme.separator }]}>
        <BlurView
          intensity={70}
          tint={theme.scheme === 'dark' ? 'systemThickMaterialDark' : 'systemThickMaterialLight'}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scheme === 'dark' ? 'rgba(44,44,46,0.7)' : 'rgba(255,255,255,0.75)' }]}
        />
        <Icon name={icon} size={18} color={color} fallback={DEFAULT_ICON[data.kind].fallback} />
        <Text style={[styles.text, { color: theme.text }]} numberOfLines={2}>
          {data.text}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '88%',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    boxShadow: Elevation.raised,
  },
  text: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
});
