import { router, Stack, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Avatar } from '@/components/avatar';
import { CountBadge } from '@/components/badge';
import { InstallBanner, OfflineBanner, VerifyEmailBanner } from '@/components/banners';
import { ChatPreview } from '@/components/chat-preview';
import { HeaderAction } from '@/components/header-action';
import { Icon } from '@/components/icon';
import { ListMessage } from '@/components/list-states';
import { PulseRing } from '@/components/pulse-ring';
import { ReadTicks } from '@/components/read-ticks';
import { ScalePressable } from '@/components/scale-pressable';
import { SkeletonRows } from '@/components/skeleton';
import { LargeTitleHeader } from '@/components/web-header';
import { Spacing } from '@/constants/theme';
import { useAppearance } from '@/context/appearance';
import { useAuth } from '@/context/auth';
import { useBlocks } from '@/context/blocks';
import { useChats } from '@/context/chats';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import {
  formatChatTime,
  hideChatForMe,
  isOnline,
  isTyping,
  otherMemberId,
  unreadFor,
  type Chat,
  type UserProfile,
} from '@/lib/chat';
import { confirmDestructive } from '@/lib/confirm';
import { haptics } from '@/lib/haptics';

const ACTION_WIDTH = 88;

type Filter = 'all' | 'unread' | 'online';

export default function ChatsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const { chats: allChats, error } = useChats();
  const { blocked } = useBlocks();
  const myUid = user!.uid;
  // People I blocked disappear from my list (unblock in Settings → Blocked Users).
  const chats = allChats?.filter((c) => !blocked.includes(otherMemberId(c, myUid))) ?? null;
  const profiles = useUserProfiles((chats ?? []).map((c) => otherMemberId(c, myUid)));
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // Re-render every few seconds so "typing…" and online rings expire.
  useNow(5000);

  const profileOf = (c: Chat) => profiles[otherMemberId(c, myUid)];
  const nameOf = (c: Chat) =>
    profileOf(c)?.name ?? c.names?.[otherMemberId(c, myUid)] ?? 'Unknown';
  const unreadCount = (chats ?? []).filter((c) => unreadFor(c, myUid) > 0).length;
  const onlineCount = (chats ?? []).filter((c) => isOnline(profileOf(c)?.lastSeen)).length;

  const term = search.trim().toLowerCase();
  const shown =
    chats?.filter((c) => {
      if (filter === 'unread' && unreadFor(c, myUid) === 0) return false;
      if (filter === 'online' && !isOnline(profileOf(c)?.lastSeen)) return false;
      if (!term) return true;
      return (
        nameOf(c).toLowerCase().includes(term) || (c.lastMessage ?? '').toLowerCase().includes(term)
      );
    }) ?? null;

  const newChat = () => router.push('/users');

  return (
    <>
      {Platform.OS !== 'web' ? (
        <>
          <Stack.Screen options={{ headerLeft: () => <MyAvatarButton size={32} /> }} />
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
        contentContainerStyle={shown?.length ? styles.listContent : styles.emptyContainer}
        ListHeaderComponent={
          <>
            <OfflineBanner />
            <LargeTitleHeader
              title="Chats"
              leading={<MyAvatarButton size={34} />}
              action={{ icon: 'square.and.pencil', label: 'New chat', onPress: newChat }}
              search={{ value: search, onChangeText: setSearch }}
            />
            <VerifyEmailBanner />
            <InstallBanner />
            {!term && chats && chats.length > 0 ? (
              <ContactsRow chats={chats} myUid={myUid} profiles={profiles} />
            ) : null}
            {chats && chats.length > 0 ? (
              <FilterChips
                value={filter}
                onChange={setFilter}
                counts={{ all: chats.length, unread: unreadCount, online: onlineCount }}
              />
            ) : null}
          </>
        }
        ListEmptyComponent={
          chats === null && !error ? (
            <SkeletonRows />
          ) : term ? (
            <ListMessage empty={`No results for "${search.trim()}"`} />
          ) : error ? (
            <ListMessage error={error} />
          ) : filter === 'unread' && chats?.length ? (
            <ListMessage empty={'You’re all caught up ✨\nNo unread messages.'} />
          ) : filter === 'online' && chats?.length ? (
            <ListMessage empty="Nobody is active right now." />
          ) : (
            <EmptyState onNewChat={newChat} />
          )
        }
        renderItem={({ item }) => (
          <ChatRow chat={item} myUid={myUid} profile={profileOf(item)} name={nameOf(item)} />
        )}
      />
    </>
  );
}

/** My profile photo in the header; opens Settings (like WhatsApp / Telegram). */
function MyAvatarButton({ size }: { size: number }) {
  const { user, displayName } = useAuth();
  const me = useUserProfile(user?.uid);
  return (
    <Pressable
      onPress={() => router.navigate('/settings' as Href)}
      accessibilityRole="button"
      accessibilityLabel="Your profile and settings"
      hitSlop={8}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Avatar id={user?.uid ?? 'me'} name={displayName ?? 'Me'} size={size} uri={me?.avatarUrl} />
    </Pressable>
  );
}

/** All · Unread · Online segmented pills. */
function FilterChips({ value, onChange, counts }: {
  value: Filter;
  onChange: (f: Filter) => void;
  counts: Record<Filter, number>;
}) {
  const theme = useTheme();
  const { bubbleColor } = useAppearance();
  const items: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'online', label: 'Online' },
  ];
  return (
    <View style={styles.chips} accessibilityRole="tablist">
      {items.map((item) => {
        const selected = item.id === value;
        const count = counts[item.id];
        return (
          <ScalePressable
            key={item.id}
            onPress={() => {
              if (!selected) haptics.light();
              onChange(item.id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              selected
                ? { backgroundColor: bubbleColor }
                : { backgroundColor: theme.backgroundElement },
            ]}>
            {item.id === 'online' ? (
              <View style={[styles.chipDot, selected && styles.chipDotSelected]} />
            ) : null}
            <Text style={[styles.chipText, { color: selected ? '#fff' : theme.text }]}>
              {item.label}
            </Text>
            {item.id !== 'all' && count > 0 ? (
              <Text
                style={[
                  styles.chipCount,
                  { color: selected ? 'rgba(255,255,255,0.85)' : theme.textSecondary },
                ]}>
                {count}
              </Text>
            ) : null}
          </ScalePressable>
        );
      })}
    </View>
  );
}

function ChatRow({ chat, myUid, profile, name }: {
  chat: Chat;
  myUid: string;
  profile: UserProfile | undefined;
  name: string;
}) {
  const theme = useTheme();
  const { bubbleColor } = useAppearance();
  const otherId = otherMemberId(chat, myUid);
  const unread = unreadFor(chat, myUid);
  const typing = isTyping(chat, otherId);
  const online = isOnline(profile?.lastSeen);
  const sentByMe = chat.lastSenderId === myUid;
  // My last message was read once the other person's read marker passes it.
  const seen =
    sentByMe && (chat.lastRead?.[otherId]?.toMillis() ?? 0) >= (chat.updatedAt?.toMillis() ?? Infinity);

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
        <Avatar id={otherId} name={name} size={58} online={online} uri={profile?.avatarUrl} />
        <View style={[styles.rowBody, { borderBottomColor: theme.separator }]}>
          <View style={styles.rowTop}>
            <Text
              style={[styles.name, { color: theme.text }, unread > 0 && styles.nameUnread]}
              numberOfLines={1}>
              {name}
            </Text>
            <Text
              style={[
                styles.time,
                { color: unread ? bubbleColor : theme.textSecondary },
                unread > 0 && styles.bold,
              ]}>
              {formatChatTime(chat.updatedAt)}
            </Text>
          </View>
          <View style={styles.rowBottom}>
            {typing ? (
              <Text style={[styles.preview, styles.typing, { color: bubbleColor }]} numberOfLines={1}>
                typing…
              </Text>
            ) : (
              <View style={styles.previewRow}>
                {sentByMe ? (
                  <ReadTicks read={seen} color={seen ? bubbleColor : theme.textSecondary} />
                ) : null}
                <ChatPreview
                  text={chat.lastMessage ?? ''}
                  color={unread ? theme.text : theme.textSecondary}
                  style={unread > 0 ? [styles.preview, styles.semibold] : [styles.preview]}
                />
              </View>
            )}
            {unread > 0 ? (
              <CountBadge count={unread} color={bubbleColor} style={styles.badge} />
            ) : null}
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}

/** Story-style row of everyone I chat with; a breathing gradient ring means active now. */
function ContactsRow({ chats, myUid, profiles }: {
  chats: Chat[];
  myUid: string;
  profiles: Record<string, UserProfile>;
}) {
  // Active people first, then the most recent chats.
  const ordered = [...chats].sort(
    (a, b) =>
      Number(isOnline(profiles[otherMemberId(b, myUid)]?.lastSeen)) -
      Number(isOnline(profiles[otherMemberId(a, myUid)]?.lastSeen))
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.contacts}>
      {ordered.map((chat) => (
        <ContactBubble
          key={chat.id}
          chat={chat}
          myUid={myUid}
          profile={profiles[otherMemberId(chat, myUid)]}
        />
      ))}
    </ScrollView>
  );
}

function ContactBubble({ chat, myUid, profile }: {
  chat: Chat;
  myUid: string;
  profile: UserProfile | undefined;
}) {
  const theme = useTheme();
  const { bubbleColor } = useAppearance();
  const otherId = otherMemberId(chat, myUid);
  const name = profile?.name ?? chat.names?.[otherId] ?? 'Unknown';
  const online = isOnline(profile?.lastSeen);
  const unread = unreadFor(chat, myUid);
  return (
    <ScalePressable
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: chat.id, otherId, name } })}
      accessibilityRole="button"
      accessibilityLabel={`${name}${online ? ', active now' : ''}`}
      style={styles.contact}>
      <View>
        <PulseRing
          size={68}
          active={online}
          gradient={`linear-gradient(135deg, ${bubbleColor} 0%, #FF6CAB 100%)`}
          idleColor={theme.backgroundElement}
          gap={theme.background}>
          <Avatar id={otherId} name={name} size={56} uri={profile?.avatarUrl} />
        </PulseRing>
        {unread > 0 ? (
          <CountBadge
            count={unread}
            color={bubbleColor}
            style={[styles.contactBadge, { borderColor: theme.background }]}
          />
        ) : null}
      </View>
      <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
        {name.split(/\s+/)[0]}
      </Text>
      <Text style={[styles.contactStatus, { color: online ? '#34C759' : theme.textSecondary }]}>
        {online ? 'Active' : ' '}
      </Text>
    </ScalePressable>
  );
}

function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  const theme = useTheme();
  const { bubbleColor } = useAppearance();
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.empty}>
      <View
        style={[
          styles.emptyIcon,
          { backgroundImage: `linear-gradient(135deg, ${bubbleColor} 0%, #FF6CAB 100%)` },
        ]}>
        <Icon name="bubble.left.and.bubble.right.fill" size={44} color="#fff" fallback="💬" />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>No Conversations</Text>
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
        Start a chat with a friend.{'\n'}Your conversations will appear here.
      </Text>
      <ScalePressable
        onPress={onNewChat}
        style={[styles.emptyButton, { backgroundColor: bubbleColor }]}
        accessibilityRole="button">
        <Icon name="square.and.pencil" size={17} color="#fff" fallback="" />
        <Text style={styles.emptyButtonText}>New Chat</Text>
      </ScalePressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: Spacing.four },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.three, gap: 12 },
  rowBody: {
    flex: 1,
    minHeight: 82,
    justifyContent: 'center',
    paddingVertical: 11,
    paddingRight: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 20 },
  previewRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { flex: 1, fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
  nameUnread: { fontWeight: '700' },
  time: { fontSize: 14, fontVariant: ['tabular-nums'] },
  preview: { flex: 1, fontSize: 15, lineHeight: 20 },
  typing: { fontStyle: 'italic', fontWeight: '500' },
  badge: { marginLeft: 4 },
  bold: { fontWeight: '600' },
  semibold: { fontWeight: '500' },
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
  },
  chipText: { fontSize: 15, fontWeight: '600' },
  chipCount: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  chipDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#34C759' },
  chipDotSelected: { backgroundColor: '#fff' },
  contacts: { paddingHorizontal: Spacing.three, paddingTop: 10, paddingBottom: 6, gap: 14 },
  contact: { width: 72, alignItems: 'center' },
  contactBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    borderWidth: 2,
    height: 24,
    minWidth: 24,
    borderRadius: 12,
  },
  contactName: { fontSize: 13, fontWeight: '500', textAlign: 'center', marginTop: 6 },
  contactStatus: { fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 1 },
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
    width: 104,
    height: 104,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
  },
  emptyTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  emptyText: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 26,
    marginTop: Spacing.three,
  },
  emptyButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
