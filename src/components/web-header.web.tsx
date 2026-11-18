import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** iOS large-title header for the browser: big bold title, optional action and search field. */
export function LargeTitleHeader({ title, action, search, leading }: {
  title: string;
  /** shown at the top left (e.g. my profile photo) */
  leading?: ReactNode;
  action?: { icon: IconName; label: string; onPress: () => void };
  search?: { value: string; onChangeText: (text: string) => void; placeholder?: string };
}) {
  const theme = useTheme();
  // Below the iPhone status bar when opened from the home screen.
  const { top } = useSafeAreaInsets();
  return (
    <View style={[styles.large, { paddingTop: top }]}>
      <View style={styles.topBar}>
        <View>{leading}</View>
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={10}
            style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.5 : 1 }]}>
            <Icon name={action.icon} size={24} color={theme.accent} fallback={action.label} />
          </Pressable>
        ) : null}
      </View>
      <Text style={[styles.largeTitle, { color: theme.text }]}>{title}</Text>
      {search ? <InlineSearch {...search} /> : null}
    </View>
  );
}

/** iOS-style rounded gray search field. */
export function InlineSearch({ value, onChangeText, placeholder = 'Search' }: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: theme.glassStrong, borderColor: theme.glassBorder, borderWidth: StyleSheet.hairlineWidth }]}>
      <Icon name="magnifyingglass" size={17} color={theme.textSecondary} fallback="" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        autoCorrect={false}
        style={[styles.searchInput, { color: theme.text }]}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityLabel="Clear search">
          <Icon name="xmark.circle.fill" size={17} color={theme.textSecondary} fallback="×" />
        </Pressable>
      ) : null}
    </View>
  );
}

/** iOS back button: chevron plus the previous screen's title. */
export function WebBackButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      style={({ pressed }) => [styles.back, { opacity: pressed ? 0.5 : 1 }]}>
      <Icon name="chevron.left" size={24} color={theme.accent} fallback="‹" />
      <Text style={[styles.backText, { color: theme.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  large: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  topBar: { height: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionButton: { padding: 4 },
  largeTitle: { fontSize: 34, fontWeight: '700', letterSpacing: 0.4, marginBottom: Spacing.two },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  searchInput: { flex: 1, fontSize: 17, outlineStyle: 'none' } as object,
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  backText: { fontSize: 17, marginLeft: -2 },
});
