import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Avatar } from '@/components/avatar';
import { InstallBanner, OfflineBanner, VerifyEmailBanner } from '@/components/banners';
import { CountBadge } from '@/components/badge';
import { HeaderAction } from '@/components/header-action';
import { Icon } from '@/components/icon';
import { ListMessage } from '@/components/list-states';
import { ScalePressable } from '@/components/scale-pressable';
import { SkeletonRows } from '@/components/skeleton';
import { LargeTitleHeader } from '@/components/web-header';
import { Accent, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useBlocks } from '@/context/blocks';
import { useChats } from '@/context/chats';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfile } from '@/hooks/use-user-profile';
import {
  formatChatTime,
  hideChatForMe,
  isOnline,
  isTyping,
  otherMemberId,
  unreadFor,
  type Chat,
} from '@/lib/chat';
import { confirmDestructive } from '@/lib/confirm';
import { haptics } from '@/lib/haptics';

const ACTION_WIDTH = 88;

export default function ChatsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const { chats: allChats, error } = useChats();
  const { blocked } = useBlocks();
  // People I blocked disappear from my list (unblock in Settings → Blocked Users).
  const chats = allChats?.filter((c) => !blocked.includes(otherMemberId(c, user!.uid))) ?? null;
  const [search, setSearch] = useState('');
  // Re-render every few seconds so "typing…" and online dots expire.
  useNow(5000);
  const myUid = user!.uid;

  const term = search.trim().toLowerCase();
  const shown =
    chats?.filter((c) => {
      if (!term) return true;
      const name = c.names?.[otherMemberId(c, myUid)] ?? '';
      return name.toLowerCase().includes(term) || (c.lastMessage ?? '').toLowerCase().includes(term);
    }) ?? null;

  const newChat = () => router.push('/users');

  return (
    <>
      {Platform.OS !== 'web' ? (
        <>
          <HeaderAction
            placement="right"
            icon="square.and.pencil"
            label="New"
            bold
            onPress={newChat}
          />
          <Stack.SearchBar
            placeholder="Search"
            hideWhenScrolling
            onChangeText={(e) => setSearch(e.nativeEvent.text)}
            onCancelButtonPress={() => setSearch('')}
          />
        </>
      ) : null}
      <Animated.FlatList
        style={{ backgroundColor: theme.background }}
        data={shown ?? []}
        keyExtractor={(c) => c.id}
        // Rows glide to their new position when a chat jumps to the top.
        itemLayoutAnimation={LinearTransition.springify().damping(20)}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        contentContainerStyle={shown?.length ? undefined : styles.emptyContainer}
        ListHeaderComponent={
          <>
            <OfflineBanner />
            <LargeTitleHeader
            title="Chats"
            action={{ icon: 'square.and.pencil', label: 'New chat', onPress: newChat }}
            search={{ value: search, onChangeText: setSearch }}
            />
            <VerifyEmailBanner />
            <InstallBanner />
          </>
        }
        ListEmptyComponent={
          chats === null && !error ? (
            <SkeletonRows />
          ) : term ? (
            <ListMessage empty={`No results for "${search.trim()}"`} />
          ) : error ? (
            <ListMessage error={error} />
          ) : (
            <EmptyState onNewChat={newChat} />
          )
        }
        renderItem={({ item }) => <ChatRow chat={item} myUid={myUid} />}
      />
    </>
  );
}

function ChatRow({ chat, myUid }: { chat: Chat; myUid: string }) {
  const theme = useTheme();
  const otherId = otherMemberId(chat, myUid);
  const profile = useUserProfile(otherId);
  const name = profile?.name ?? chat.names?.[otherId] ?? 'Unknown';
  const unread = unreadFor(chat, myUid);
  const typing = isTyping(chat, otherId);
  const preview = chat.lastSenderId === myUid ? `You: ${chat.lastMessage}` : chat.lastMessage;

  function askDelete(swipeable: SwipeableMethods) {
    haptics.warning();
    swipeable.close();
    confirmDestructive({
      title: `Delete chat with ${name}?`,
      message: `It is removed from your list only. ${name} keeps their copy.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        hideChatForMe(chat.id, myUid).catch(() => haptics.error());
      },
    });
  }

  return (
    <Swipeable
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      onSwipeableWillOpen={() => haptics.medium()}
      renderRightActions={(_progress, _translation, swipeable) => (
        <Pressable
          onPress={() => askDelete(swipeable)}
          accessibilityRole="button"
          accessibilityLabel={`Delete chat with ${name}`}
          style={styles.deleteAction}>
          <Icon name="trash.fill" size={22} color="#fff" fallback="🗑" />
          <Text style={styles.actionText}>Delete</Text>
        </Pressable>
      )}>
      <Pressable
        onPress={() =>
          router.push({ pathname: '/chat/[id]', params: { id: chat.id, otherId, name } })
        }
        accessibilityLabel={`${name}${unread ? `, ${unread} unread` : ''}`}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? theme.backgroundSelected : theme.background },
        ]}>
        {/* iOS-style unread dot in the left gutter */}
        <View style={[styles.unreadDot, unread > 0 && { backgroundColor: Accent }]} />
        <Avatar
          id={otherId}
          name={name}
          size={52}
          online={isOnline(profile?.lastSeen)}
          uri={profile?.avatarUrl}
        />
        <View style={[styles.rowBody, { borderBottomColor: theme.separator }]}>
          <View style={styles.rowTop}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {name}
            </Text>
            <Text
              style={[
                styles.time,
                { color: unread ? Accent : theme.textSecondary },
                unread > 0 && styles.bold,
              ]}>
              {formatChatTime(chat.updatedAt)}
            </Text>
            <Icon name="chevron.right" size={12} color={theme.textSecondary} fallback="" />
          </View>
          <View style={styles.rowBottom}>
            {typing ? (
              <Text style={[styles.preview, styles.typing]} numberOfLines={1}>
                typing…
              </Text>
            ) : (
              <Text
                style={[
                  styles.preview,
                  { color: unread ? theme.text : theme.textSecondary },
                  unread > 0 && styles.semibold,
                ]}
                numberOfLines={2}>
                {preview}
              </Text>
            )}
            <CountBadge count={unread} />
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}

function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundElement }]}>
        <Icon name="bubble.left.and.bubble.right.fill" size={44} color={Accent} fallback="💬" />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>No Conversations</Text>
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
        Start a chat with a friend.{'\n'}Your conversations will appear here.
      </Text>
      <ScalePressable onPress={onNewChat} style={styles.emptyButton} accessibilityRole="button">
        <Icon name="square.and.pencil" size={17} color="#fff" fallback="" />
        <Text style={styles.emptyButtonText}>New Chat</Text>
      </ScalePressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 4, gap: 10 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, marginRight: -2 },
  rowBody: {
    flex: 1,
    minHeight: 78,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingRight: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { flex: 1, fontSize: 17, fontWeight: '600' },
  time: { fontSize: 15 },
  preview: { flex: 1, fontSize: 15, lineHeight: 20 },
  typing: { color: Accent, fontStyle: 'italic' },
  bold: { fontWeight: '600' },
  semibold: { fontWeight: '500' },
  deleteAction: {
    width: ACTION_WIDTH,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  emptyContainer: { flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
    gap: Spacing.two,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700' },
  emptyText: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Accent,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: Spacing.three,
  },
  emptyButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
