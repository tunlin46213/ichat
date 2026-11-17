import { NativeTabs } from 'expo-router/native-tabs';

import { ChatsProvider, useChats } from '@/context/chats';

export default function TabsLayout() {
  return (
    <ChatsProvider>
      <Tabs />
    </ChatsProvider>
  );
}

function Tabs() {
  const { totalUnread } = useChats();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="chats">
        <NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }}
          md="chat"
        />
        <NativeTabs.Trigger.Badge hidden={totalUnread === 0}>
          {totalUnread > 99 ? '99+' : String(totalUnread)}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
