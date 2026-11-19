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
    <Tabs style={[styles.flex, { backgroundColor: theme.background }]}>
      {/* Room below the content for the floating bar, so nothing hides behind it. */}
      <TabSlot style={[styles.flex, { marginBottom: BAR_HEIGHT + Math.max(bottom, 10) + 8 }]} />
      {/* Floating glass capsule, like the iOS 26 tab bar the iPhone app uses. */}
      <TabList
        style={[
          styles.bar,
          {
            bottom: Math.max(bottom, 10),
            backgroundColor: theme.scheme === 'dark' ? 'rgba(30,30,34,0.78)' : 'rgba(255,255,255,0.8)',
            backdropFilter: 'blur(24px) saturate(180%)',
            borderColor: theme.glassBorder,
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
      <View style={[styles.tabInner, isFocused && [styles.tabOn, { backgroundColor: theme.glassStrong }]]}>
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

const BAR_HEIGHT = 62;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    width: 220,
    height: BAR_HEIGHT,
    padding: 4,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
  },
  tab: { flex: 1, alignItems: 'stretch' },
  tabOn: { borderRadius: (BAR_HEIGHT - 8) / 2 },
  tabInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabLabel: { fontSize: 10, fontWeight: '500' },
  badge: { position: 'absolute', top: 2, left: '56%', height: 18, minWidth: 18, borderRadius: 9 },
});
