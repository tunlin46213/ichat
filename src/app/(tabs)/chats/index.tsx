import { router, Stack } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Avatar } from '@/components/avatar';
import { HeaderAction } from '@/components/header-action';
import { Icon } from '@/components/icon';
import { ListMessage } from '@/components/list-states';
import { ScalePressable } from '@/components/scale-pressable';
import { SkeletonRows } from '@/components/skeleton';
import { LargeTitleHeader } from '@/components/web-header';
import { Accent, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import {
  formatChatTime,
  hideChatForMe,
  isChatVisibleTo,
  otherMemberId,
  type Chat,
} from '@/lib/chat';
import { confirmDestructive } from '@/lib/confirm';
import { db } from '@/lib/firebase';
import { haptics } from '@/lib/haptics';

const DELETE_WIDTH = 88;

export default function ChatsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const myUid = user!.uid;

  useEffect(() => {
    // Sorted on the client so Firestore doesn't need a composite index.
    const q = query(collection(db, 'chats'), where('members', 'array-contains', myUid));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Chat)
          .filter((c) => isChatVisibleTo(c, myUid))
          .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));
        setChats(list);
        setError(null);
      },
      (err) => setError(`Could not load chats (${err.code}).`)
    );
  }, [myUid]);

  const term = search.trim().toLowerCase();
  const shown =
    chats?.filter((c) => {
      if (!term) return true;
      const name = c.names?.[otherMemberId(c, myUid)] ?? '';
      return name.toLowerCase().includes(term);
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
          <LargeTitleHeader
            title="Chats"
            action={{ icon: 'square.and.pencil', label: 'New chat', onPress: newChat }}
            search={{ value: search, onChangeText: setSearch }}
          />
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
  const name = chat.names?.[otherId] ?? 'Unknown';
  const preview = chat.lastSenderId === myUid ? `You: ${chat.lastMessage}` : chat.lastMessage;

  function askDelete(swipeable: SwipeableMethods) {
    haptics.warning();
    confirmDestructive({
      title: `Delete chat with ${name}?`,
      message: 'It is removed from your list only. ' + name + ' keeps their copy.',
      confirmLabel: 'Delete',
      onConfirm: () => {
        hideChatForMe(chat.id, myUid).catch(() => swipeable.close());
      },
    });
    swipeable.close();
  }

  return (
    <Swipeable
      friction={2}
      rightThreshold={DELETE_WIDTH / 2}
      overshootRight={false}
      onSwipeableWillOpen={() => haptics.medium()}
      renderRightActions={(_progress, _translation, swipeable) => (
        <Pressable
          onPress={() => askDelete(swipeable)}
          accessibilityRole="button"
          accessibilityLabel={`Delete chat with ${name}`}
          style={styles.deleteAction}>
          <Icon name="trash.fill" size={22} color="#fff" fallback="🗑" />
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      )}>
      <Pressable
        onPress={() =>
          router.push({ pathname: '/chat/[id]', params: { id: chat.id, otherId, name } })
        }
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? theme.backgroundSelected : theme.background },
        ]}>
        <Avatar id={otherId} name={name} size={52} />
        <View style={[styles.rowBody, { borderBottomColor: theme.separator }]}>
          <View style={styles.rowTop}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.time, { color: theme.textSecondary }]}>
              {formatChatTime(chat.updatedAt)}
            </Text>
            <Icon name="chevron.right" size={12} color={theme.textSecondary} fallback="" />
          </View>
          <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={2}>
            {preview}
          </Text>
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
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.three, gap: 12 },
  rowBody: {
    flex: 1,
    minHeight: 76,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingRight: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 17, fontWeight: '600' },
  time: { fontSize: 15 },
  preview: { fontSize: 15, lineHeight: 20 },
  deleteAction: {
    width: DELETE_WIDTH,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteText: { color: '#fff', fontSize: 13, fontWeight: '600' },
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
