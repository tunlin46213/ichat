import type { Href } from 'expo-router';
import { TabList, TabSlot, Tabs, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CountBadge } from '@/components/badge';
import { Icon, type IconName } from '@/components/icon';
import { useChats } from '@/context/chats';
import { useTheme } from '@/hooks/use-theme';

// Native tabs have no iOS-style tab bar on web, so build one with headless tabs.
// Tab folders with an index route are served at "/chats" and "/settings".
// ChatsProvider is in the root layout (it also feeds the in-app banner).
export default function TabsLayout() {
  const theme = useTheme();
  const { totalUnread } = useChats();
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs style={styles.flex}>
      <TabSlot style={styles.flex} />
      <TabList
        style={[
          styles.bar,
          {
            // Frosted glass bar, like iOS.
            backgroundColor: theme.scheme === 'dark' ? 'rgba(18,18,22,0.72)' : 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(20px) saturate(180%)',
            borderTopColor: theme.glassHairline,
            // Room for the home indicator, like on iPhone.
            paddingBottom: Math.max(bottom, 8),
          },
        ]}>
        <TabTrigger name="chats" href={'/chats' as Href} asChild>
          <TabButton
            label="Chats"
            icon="bubble.left.and.bubble.right"
            activeIcon="bubble.left.and.bubble.right.fill"
            badge={totalUnread}
          />
        </TabTrigger>
        <TabTrigger name="settings" href={'/settings' as Href} asChild>
          <TabButton label="Settings" icon="gearshape" activeIcon="gearshape.fill" />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

// `ref` is omitted from the type only: expo-router's slot ref type doesn't match
// Pressable's. At runtime the ref still flows through `...props`.
function TabButton({ label, icon, activeIcon, badge = 0, isFocused, ...props }: Omit<
  TabTriggerSlotProps,
  'ref'
> & {
  label: string;
  icon: IconName;
  activeIcon: IconName;
  badge?: number;
}) {
  const theme = useTheme();
  const color = isFocused ? theme.accent : '#8E8E93';
  return (
    <Pressable {...props} accessibilityRole="tab" style={styles.tab}>
      <View style={styles.tabInner}>
        {/* Re-keyed so the icon bounces when its tab is selected. */}
        <Animated.View key={isFocused ? 'on' : 'off'} entering={isFocused ? ZoomIn.springify().damping(9) : undefined}>
          <Icon name={isFocused ? activeIcon : icon} size={25} color={color} fallback="•" />
        </Animated.View>
        <Text style={[styles.tabLabel, { color }]}>{label}</Text>
        <CountBadge count={badge} color="#FF3B30" style={styles.badge} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabInner: { alignItems: 'center', gap: 2 },
  tabLabel: { fontSize: 10, fontWeight: '500' },
  badge: { position: 'absolute', top: -4, left: 18, height: 18, minWidth: 18, borderRadius: 9 },
});
