import { NativeTabs } from 'expo-router/native-tabs';

import { useChats } from '@/context/chats';
import { useTheme } from '@/hooks/use-theme';

// ChatsProvider is in the root layout (it also feeds the in-app banner).
export default function TabsLayout() {
  const { totalUnread } = useChats();
  const theme = useTheme();
  return (
    <NativeTabs tintColor={theme.accent} badgeBackgroundColor={theme.danger}>
      <NativeTabs.Trigger name="chats">
        <NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }}
          md="chat"
        />
        {/* Rendered only when needed: `hidden` still showed a "0" badge on iOS 26. */}
        {totalUnread > 0 ? (
          <NativeTabs.Trigger.Badge>{totalUnread > 99 ? '99+' : String(totalUnread)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
