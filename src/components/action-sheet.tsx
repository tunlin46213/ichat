import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';

/**
 * Runs `fn` once a just-closed RN <Modal> is gone. iOS refuses to present anything
 * (image picker, alert, modal screen) while another view controller is still being
 * dismissed, and silently drops it, so wait for the dismissal to finish there.
 */
export function afterModalClose(fn: () => void) {
  if (Platform.OS === 'ios') setTimeout(fn, 350);
  else fn();
}

export type SheetOption = { label: string; icon: IconName; fallback: string; onPress: () => void };

/**
 * iOS-style action sheet that also works on web (React Native's Alert can't show
 * buttons in the browser). Picking an option closes the sheet first.
 */
export function ActionSheet({ visible, title, options, onClose }: {
  visible: boolean;
  title?: string;
  options: SheetOption[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.springify().damping(20)}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.group, { backgroundColor: theme.card }]}>
          {title ? (
            <Text style={[styles.title, { color: theme.textSecondary, borderBottomColor: theme.separator }]}>
              {title}
            </Text>
          ) : null}
          {options.map((option, i) => (
            <Pressable
              key={option.label}
              onPress={() => {
                onClose();
                afterModalClose(option.onPress);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.option,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator },
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}>
              <Icon name={option.icon} size={20} color={theme.accent} fallback={option.fallback} />
              <Text style={[styles.optionText, { color: theme.accent }]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.group,
            styles.cancel,
            { backgroundColor: pressed ? theme.backgroundSelected : theme.card },
          ]}>
          <Text style={[styles.optionText, { color: theme.accent }, styles.cancelText]}>Cancel</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 8, right: 8, bottom: 0, gap: 8 },
  group: { borderRadius: 14, overflow: 'hidden' },
  title: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
  },
  optionText: { fontSize: 19 },
  cancel: { minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontWeight: '600' },
});
