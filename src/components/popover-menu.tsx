import { BlurView } from 'expo-blur';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';

export type PopoverItem = {
  label: string;
  icon?: IconName;
  fallback?: string;
  destructive?: boolean;
  /** opens a sub-menu instead of closing (e.g. "Report…") */
  keepOpen?: boolean;
  onPress: () => void;
};

export type PopoverAnchor = { x: number; y: number; width: number; height: number };

const WIDTH = 230;
const ROW = 46;

/**
 * A small iOS-style menu that opens next to the button that called it (measure the button
 * with `measureInWindow` and pass it as `anchor`). Right-aligned to the button; opens
 * upwards when there's no room below.
 */
export function PopoverMenu({ anchor, title, items, onClose, onBack }: {
  anchor: PopoverAnchor | null;
  title?: string;
  items: PopoverItem[];
  onClose: () => void;
  /** shows "‹" next to the title (a sub-menu) */
  onBack?: () => void;
}) {
  const theme = useTheme();
  const { width: W, height: H } = useWindowDimensions();
  if (!anchor) return null;

  const height = items.length * ROW + (title ? 40 : 0);
  const below = anchor.y + anchor.height + 6 + height < H - 24;
  const right = Math.max(8, W - (anchor.x + anchor.width));
  const position = below ? { top: anchor.y + anchor.height + 6 } : { top: Math.max(24, anchor.y - 6 - height) };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View
        entering={FadeIn.duration(140)}
        style={[
          styles.menu,
          position,
          { right, borderColor: theme.separator, transformOrigin: below ? 'top right' : 'bottom right' },
        ]}>
        <BlurView
          intensity={80}
          tint={theme.scheme === 'dark' ? 'systemThickMaterialDark' : 'systemThickMaterialLight'}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.scheme === 'dark' ? 'rgba(40,40,44,0.82)' : 'rgba(250,250,252,0.88)' },
          ]}
        />
        {title ? (
          <View style={[styles.title, { borderBottomColor: theme.separator }]}>
            {onBack ? (
              <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
                <Icon name="chevron.left" size={14} color={theme.accent} fallback="‹" />
              </Pressable>
            ) : null}
            <Text style={[styles.titleText, { color: theme.textSecondary }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
        ) : null}
        {items.map((item, i) => {
          const color = item.destructive ? '#FF3B30' : theme.text;
          return (
            <Pressable
              key={item.label}
              onPress={() => {
                if (!item.keepOpen) onClose();
                item.onPress();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopColor: theme.separator, borderTopWidth: StyleSheet.hairlineWidth },
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}>
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {item.label}
              </Text>
              {item.keepOpen ? (
                <Icon name="chevron.right" size={13} color={theme.textSecondary} fallback="›" />
              ) : item.icon ? <Icon name={item.icon} size={17} color={color} fallback={item.fallback ?? ''} /> : null}
            </Pressable>
          );
        })}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: WIDTH,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
  },
  title: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleText: { flex: 1, fontSize: 13, fontWeight: '600' },
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
  },
  label: { flex: 1, fontSize: 16 },
});
