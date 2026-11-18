import { router, Stack, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { toast } from '@/components/toast';
import { ActionSheet } from '@/components/action-sheet';
import { AuroraBackground } from '@/components/aurora';
import { Avatar } from '@/components/avatar';
import { CountBadge } from '@/components/badge';
import { InstallBanner, OfflineBanner, VerifyEmailBanner } from '@/components/banners';
import { ChatPreview } from '@/components/chat-preview';
import { HeaderAction } from '@/components/header-action';
import { Icon, type IconName } from '@/components/icon';
import { ListMessage } from '@/components/list-states';
import { PulseRing } from '@/components/pulse-ring';
import { ReadTicks } from '@/components/read-ticks';
import { ScalePressable } from '@/components/scale-pressable';
import { SkeletonRows } from '@/components/skeleton';
import { LargeTitleHeader } from '@/components/web-header';
import { Elevation, Radius, Spacing, Type } from '@/constants/theme';
import { useAppearance } from '@/context/appearance';
import { useAuth } from '@/context/auth';
import { useBlocks } from '@/context/blocks';
import { useChats } from '@/context/chats';
import { useStories, type StoryGroup } from '@/context/stories';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useSuggestedPeople } from '@/hooks/use-suggested-people';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import {
  chatIdFor,
  formatChatTime,
  hideChatForMe,
  isArchivedFor,
  isOnline,
  isPinnedFor,
  markRead,
  markUnread,
  MAX_PINNED_CHATS,
  setChatArchived,
  setChatPinned,
  isTyping,
  otherMemberId,
  unreadFor,
  type Chat,
  type UserProfile,
} from '@/lib/chat';
import { confirmDestructive } from '@/lib/confirm';
import { useDrafts } from '@/lib/drafts';
import { haptics } from '@/lib/haptics';
import { mediaErrorMessage, pickImage } from '@/lib/media';
import { setStoryDraft } from '@/lib/stories';

type Filter = 'all' | 'unread' | 'online';
type ListItem = Chat | { kind: 'section'; id: string; title: string; count: number };

function SectionHeader({ title, count }: { title: string; count: number }) {
  const theme = useTheme();
  return (
    <View style={styles.section} accessibilityRole="header">
      {title === 'Pinned' ? <Icon name="pin.fill" size={11} color={theme.warning} fallback="📌" /> : null}
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title.toUpperCase()}</Text>
      <Text style={[styles.sectionCount, { color: theme.textSecondary }]}>{count}</Text>
    </View>
  );
}

export default function ChatsScreen() {
  const { user } = useAuth();
  const { chats: allChats, error } = useChats();
  const { blocked } = useBlocks();
  const myUid = user!.uid;
  // People I blocked disappear from my list (unblock in Settings → Blocked Users).
  const chats = allChats?.filter((c) => !blocked.includes(otherMemberId(c, myUid))) ?? null;
  const { others: storyGroups } = useStories();
  // Profiles for chat partners and for anyone with a story in the row.
  const profiles = useUserProfiles([
    ...(chats ?? []).map((c) => otherMemberId(c, myUid)),
    ...storyGroups.map((g) => g.ownerId),
  ]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showArchived, setShowArchived] = useState(false);
  // Re-render every few seconds so "typing…" and online rings expire.
  useNow(5000);

  const profileOf = (c: Chat) => profiles[otherMemberId(c, myUid)];
  const nameOf = (c: Chat) =>
    profileOf(c)?.name ?? c.names?.[otherMemberId(c, myUid)] ?? 'Unknown';
  const unreadCount = (chats ?? []).filter((c) => unreadFor(c, myUid) > 0 && !isArchivedFor(c, myUid)).length;
  const onlineCount = (chats ?? []).filter((c) => isOnline(profileOf(c)?.lastSeen)).length;

  const term = search.trim().toLowerCase();
  const archivedChats = (chats ?? []).filter((c) => isArchivedFor(c, myUid));
  const archivedUnread = archivedChats.filter((c) => unreadFor(c, myUid) > 0).length;
  const inArchive = showArchived && archivedChats.length > 0;
  const pinnedCount = (chats ?? []).filter((c) => isPinnedFor(c, myUid)).length;
  // Pinned first (most recently pinned on top), then newest activity.
  // A pin that's still being saved has no time yet: treat it as newest.
  const pinnedTime = (c: Chat) => c.pinnedAt?.[myUid]?.toMillis() ?? Number.MAX_SAFE_INTEGER;
  const sorted = chats
    ? [...chats].sort((a, b) => {
        const pa = isPinnedFor(a, myUid);
        const pb = isPinnedFor(b, myUid);
        if (pa !== pb) return pa ? -1 : 1;
        if (pa && pb) return pinnedTime(b) - pinnedTime(a);
        return (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0);
      })
    : null;
  const shown =
    sorted?.filter((c) => {
      // Search looks everywhere; otherwise the archive and the main list are separate.
      if (!term && isArchivedFor(c, myUid) !== inArchive) return false;
      if (filter === 'unread' && unreadFor(c, myUid) === 0) return false;
      if (filter === 'online' && !isOnline(profileOf(c)?.lastSeen)) return false;
      if (!term) return true;
      return (
        nameOf(c).toLowerCase().includes(term) || (c.lastMessage ?? '').toLowerCase().includes(term)
      );
    }) ?? null;

  // Smart sections: Pinned · Today · Earlier (headers only when there's more than one).
  const listData: ListItem[] = [];
  if (shown) {
    const today = new Date().toDateString();
    const groups: { id: string; title: string; chats: Chat[] }[] = [
      { id: 'pinned', title: 'Pinned', chats: [] },
      { id: 'today', title: 'Today', chats: [] },
      { id: 'earlier', title: 'Earlier', chats: [] },
    ];
    for (const c of shown) {
      if (!term && !inArchive && isPinnedFor(c, myUid)) groups[0].chats.push(c);
      else if (c.updatedAt && c.updatedAt.toDate().toDateString() === today) groups[1].chats.push(c);
      else groups[2].chats.push(c);
    }
    const used = groups.filter((g) => g.chats.length);
    for (const g of used) {
      if (used.length > 1) listData.push({ kind: 'section', id: `section-${g.id}`, title: g.title, count: g.chats.length });
      listData.push(...g.chats);
    }
  }

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
      <AuroraBackground />
      <Animated.FlatList
        style={styles.transparent}
        data={listData}
        keyExtractor={(item) => item.id}
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
            <Greeting chats={chats} myUid={myUid} profiles={profiles} />
            <VerifyEmailBanner />
            <InstallBanner />
            {!term && chats && !inArchive ? (
              <ContactsRow chats={chats} myUid={myUid} profiles={profiles} />
            ) : null}
            {chats && chats.length > 0 && !inArchive ? (
              <FilterChips
                value={filter}
                onChange={setFilter}
                counts={{ all: chats.length - archivedChats.length, unread: unreadCount, online: onlineCount }}
              />
            ) : null}
            {!term && filter === 'all' && archivedChats.length > 0 ? (
              <ArchivedRow
                count={archivedChats.length}
                unread={archivedUnread}
                open={inArchive}
                onPress={() => {
                  haptics.selection();
                  setShowArchived(!inArchive);
                }}
              />
            ) : null}
          </>
        }
        ListFooterComponent={
          !term && !inArchive && chats ? (
            <SuggestedPeople
              myUid={myUid}
              exclude={[...chats.map((c) => otherMemberId(c, myUid)), ...blocked]}
            />
          ) : undefined
        }
        ListEmptyComponent={
          chats === null && !error ? (
            <SkeletonRows />
          ) : term ? (
            <ListMessage empty={`No results for "${search.trim()}"`} />
          ) : error ? (
            <ListMessage error={error} />
          ) : inArchive ? undefined : filter === 'unread' && chats?.length ? (
            <ListMessage empty={'You’re all caught up ✨\nNo unread messages.'} />
          ) : filter === 'online' && chats?.length ? (
            <ListMessage empty="Nobody is active right now." />
          ) : (
            <EmptyState onNewChat={newChat} />
          )
        }
        renderItem={({ item }) =>
          'kind' in item ? (
            <SectionHeader title={item.title} count={item.count} />
          ) : (
          <ChatRow
            chat={item}
            myUid={myUid}
            profile={profileOf(item)}
            name={nameOf(item)}
            pinnedCount={pinnedCount}
          />
          )
        }
      />
    </>
  );
}

function greetingFor(hour: number) {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}

/** "Good evening, Tun 👋" with a one-line summary of what's new. */
function Greeting({ chats, myUid, profiles }: {
  chats: Chat[] | null;
  myUid: string;
  profiles: Record<string, UserProfile>;
}) {
  const theme = useTheme();
  const { displayName } = useAuth();
  const now = useNow(60_000);
  const first = (displayName ?? '').trim().split(/\s+/)[0];
  const unread = (chats ?? []).reduce((sum, c) => sum + (isArchivedFor(c, myUid) ? 0 : unreadFor(c, myUid)), 0);
  const active = (chats ?? [])
    .map((c) => profiles[otherMemberId(c, myUid)])
    .filter((p) => p && isOnline(p.lastSeen));
  const parts: string[] = [];
  if (unread) parts.push(`${unread} unread ${unread === 1 ? 'message' : 'messages'}`);
  if (active.length === 1) parts.push(`${active[0]!.name.split(' ')[0]} is active now`);
  else if (active.length > 1) parts.push(`${active.length} friends active now`);
  if (!parts.length) parts.push(chats?.length ? "You're all caught up ✨" : 'Start a conversation');
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.greeting}>
      <Text style={[styles.greetingTitle, { color: theme.text }]} numberOfLines={1}>
        {greetingFor(new Date(now).getHours())}
        {first ? `, ${first}` : ''} 👋
      </Text>
      <View style={styles.greetingRow}>
        {unread ? <View style={[styles.greetingDot, { backgroundColor: theme.accent }]} /> : null}
        <Text style={[styles.greetingSub, { color: theme.textSecondary }]} numberOfLines={1}>
          {parts.join(' · ')}
        </Text>
      </View>
    </Animated.View>
  );
}

/** "People you may know": iChat users I haven't talked to yet, one tap to say hi. */
function SuggestedPeople({ myUid, exclude }: { myUid: string; exclude: string[] }) {
  const theme = useTheme();
  const people = useSuggestedPeople(myUid, exclude);
  if (!people.length) return null;
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.suggested}>
      <View style={styles.section}>
        <Icon name="sparkles" size={12} color={theme.accent} fallback="✨" />
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>PEOPLE YOU MAY KNOW</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestedRow}>
        {people.slice(0, 12).map((p) => {
          const online = isOnline(p.lastSeen);
          return (
            <View
              key={p.id}
              style={[
                styles.suggestCard,
                { backgroundColor: theme.glassCard, borderColor: theme.glassBorder, boxShadow: Elevation.card },
              ]}>
              <Avatar id={p.id} name={p.name} size={56} uri={p.avatarUrl} online={online} />
              <Text style={[styles.suggestName, { color: theme.text }]} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={[styles.suggestSub, { color: online ? theme.success : theme.textSecondary }]} numberOfLines={1}>
                {online ? 'Active now' : 'On iChat'}
              </Text>
              <ScalePressable
                onPress={() =>
                  router.push({
                    pathname: '/chat/[id]',
                    params: { id: chatIdFor(myUid, p.id), otherId: p.id, name: p.name },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Say hi to ${p.name}`}
                style={[styles.sayHi, { backgroundColor: theme.accent }]}>
                <Text style={styles.sayHiText}>Say hi 👋</Text>
              </ScalePressable>
            </View>
          );
        })}
      </ScrollView>
    </Animated.View>
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
                : { backgroundColor: theme.glassStrong, borderColor: theme.glassBorder, borderWidth: StyleSheet.hairlineWidth },
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

function ChatRow({ chat, myUid, profile, name, pinnedCount }: {
  chat: Chat;
  myUid: string;
  profile: UserProfile | undefined;
  name: string;
  /** how many chats I've pinned (limit MAX_PINNED_CHATS) */
  pinnedCount: number;
}) {
  const theme = useTheme();
  const { bubbleColor, chatPrefs, setChatPrefs, textScale } = useAppearance();
  const drafts = useDrafts();
  const otherId = otherMemberId(chat, myUid);
  const unread = unreadFor(chat, myUid);
  const muted = !!chatPrefs(chat.id).muted;
  const pinned = isPinnedFor(chat, myUid);
  const archived = isArchivedFor(chat, myUid);
  const draft = drafts[chat.id];
  const typing = isTyping(chat, otherId);
  const online = isOnline(profile?.lastSeen);
  const sentByMe = chat.lastSenderId === myUid;
  // My last message was read once the other person's read marker passes it.
  const seen =
    sentByMe && (chat.lastRead?.[otherId]?.toMillis() ?? 0) >= (chat.updatedAt?.toMillis() ?? Infinity);

  function run(swipeable: SwipeableMethods, action: () => Promise<unknown> | void) {
    swipeable.close();
    haptics.light();
    const result = action();
    if (result) result.catch(() => toast.error('Something went wrong. Try again.'));
  }

  function askDelete(swipeable: SwipeableMethods) {
    haptics.warning();
    swipeable.close();
    confirmDestructive({
      title: `Delete chat with ${name}?`,
      message: `It is removed from your list only. ${name} keeps their copy.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        hideChatForMe(chat.id, myUid).then(
          () => toast.success('Chat deleted', 'trash.fill'),
          () => toast.error('Could not delete the chat')
        );
      },
    });
  }

  const leftActions = (swipeable: SwipeableMethods): SwipeAction[] => [
    {
      label: unread ? 'Read' : 'Unread',
      icon: unread ? 'envelope.open.fill' : 'envelope.badge.fill',
      fallback: unread ? '✉' : '●',
      color: theme.accent,
      onPress: () => run(swipeable, () => (unread ? markRead(chat.id, myUid) : markUnread(chat.id, myUid))),
    },
    ...(archived
      ? []
      : [
          {
            label: pinned ? 'Unpin' : 'Pin',
            icon: pinned ? 'pin.slash.fill' : 'pin.fill',
            fallback: '📌',
            color: '#FF9500',
            onPress: () =>
              run(swipeable, () => {
                if (!pinned && pinnedCount >= MAX_PINNED_CHATS) {
                  toast.error(`You can pin up to ${MAX_PINNED_CHATS} chats.`);
                  return;
                }
                return setChatPinned(chat.id, myUid, !pinned).then(() =>
                  toast.success(pinned ? 'Unpinned' : 'Pinned to top', pinned ? 'pin.slash' : 'pin.fill')
                );
              }),
          } satisfies SwipeAction,
        ]),
  ];

  const rightActions = (swipeable: SwipeableMethods): SwipeAction[] => [
    {
      label: muted ? 'Unmute' : 'Mute',
      icon: muted ? 'bell.fill' : 'bell.slash.fill',
      fallback: '🔕',
      color: '#5856D6',
      onPress: () =>
        run(swipeable, () => {
          setChatPrefs(chat.id, { muted: muted ? undefined : true });
          toast.success(muted ? 'Unmuted' : 'Muted', muted ? 'bell.fill' : 'bell.slash.fill');
        }),
    },
    {
      label: archived ? 'Unarchive' : 'Archive',
      icon: archived ? 'tray.and.arrow.up.fill' : 'archivebox.fill',
      fallback: '🗄',
      color: '#8E8E93',
      onPress: () =>
        run(swipeable, () =>
          setChatArchived(chat.id, myUid, !archived).then(() =>
            toast.success(archived ? 'Moved back to Chats' : 'Archived', archived ? 'tray.and.arrow.up.fill' : 'archivebox.fill')
          )
        ),
    },
    {
      label: 'Delete',
      icon: 'trash.fill',
      fallback: '🗑',
      color: theme.danger,
      onPress: () => askDelete(swipeable),
    },
  ];

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: unread > 0 ? `${theme.accent}66` : theme.glassBorder,
          boxShadow: unread > 0 ? `0 6px 22px ${theme.accent}38` : Elevation.card,
        },
      ]}>
    <Swipeable
      friction={2}
      leftThreshold={SWIPE_ACTION_WIDTH / 2}
      rightThreshold={SWIPE_ACTION_WIDTH / 2}
      overshootLeft={false}
      overshootRight={false}
      onSwipeableWillOpen={() => haptics.medium()}
      renderLeftActions={(progress, _t, swipeable) => (
        <SwipeActions progress={progress} actions={leftActions(swipeable)} />
      )}
      renderRightActions={(progress, _t, swipeable) => (
        <SwipeActions progress={progress} actions={rightActions(swipeable)} />
      )}>
      <Pressable
        onPress={() =>
          router.push({ pathname: '/chat/[id]', params: { id: chat.id, otherId, name } })
        }
        accessibilityLabel={`${name}${pinned ? ', pinned' : ''}${unread ? `, ${unread} unread` : ''}${draft ? ', draft' : ''}`}
        accessibilityHint="Swipe right for Unread and Pin, left for Mute, Archive and Delete."
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: theme.glassCard },
          pressed && { opacity: 0.75 },
        ]}>
        {unread > 0 ? <View style={[styles.unreadBar, { backgroundColor: theme.accent }]} /> : null}
        <Avatar id={otherId} name={name} size={56} online={online} uri={profile?.avatarUrl} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text
              style={[
                styles.name,
                { color: theme.text, fontSize: 17 * textScale },
                unread > 0 && styles.nameUnread,
              ]}
              numberOfLines={1}>
              {name}
            </Text>
            {pinned ? <Icon name="pin.fill" size={11} color={theme.warning} fallback="📌" /> : null}
            {muted ? <Icon name="bell.slash.fill" size={12} color={theme.textSecondary} fallback="🔕" /> : null}
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
            ) : draft ? (
              <Text style={[styles.preview, { color: theme.textSecondary, fontSize: 15 * textScale }]} numberOfLines={2}>
                <Text style={{ color: theme.danger, fontWeight: '600' }}>Draft: </Text>
                {draft.replace(/\s+/g, ' ')}
              </Text>
            ) : (
              <View style={styles.previewRow}>
                {sentByMe ? (
                  <ReadTicks read={seen} color={seen ? bubbleColor : theme.textSecondary} />
                ) : null}
                <ChatPreview
                  text={chat.lastMessage ?? ''}
                  color={unread ? theme.text : theme.textSecondary}
                  style={[
                    styles.preview,
                    { fontSize: 15 * textScale, lineHeight: 20 * textScale },
                    unread > 0 ? styles.semibold : {},
                  ]}
                />
              </View>
            )}
            {unread > 0 ? (
              <CountBadge count={unread} color={muted ? theme.textSecondary : bubbleColor} style={styles.badge} />
            ) : null}
          </View>
        </View>
      </Pressable>
    </Swipeable>
    </View>
  );
}

type SwipeAction = {
  label: string;
  icon: IconName;
  fallback: string;
  color: string;
  onPress: () => void;
};

const SWIPE_ACTION_WIDTH = 76;

/**
 * Colored action buttons revealed by swiping a chat row. Hidden until the row moves:
 * on web the row can be a pixel shorter than the actions, which left a colored line
 * under every chat.
 */
function SwipeActions({ progress, actions }: { progress: SharedValue<number>; actions: SwipeAction[] }) {
  const style = useAnimatedStyle(() => ({ opacity: progress.get() > 0.01 ? 1 : 0 }));
  return (
    <Animated.View style={[styles.actions, style]}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => [
            styles.swipeAction,
            { backgroundColor: action.color, opacity: pressed ? 0.8 : 1 },
          ]}>
          <Icon name={action.icon} size={21} color="#fff" fallback={action.fallback} />
          <Text style={styles.actionText} numberOfLines={1}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

/** Top row of the list: opens (or closes) the Archived chats. */
function ArchivedRow({ count, unread, open, onPress }: {
  count: number;
  unread: number;
  open: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Back to chats' : `Archived, ${count} chats${unread ? `, ${unread} unread` : ''}`}
      style={({ pressed }) => [
        styles.card,
        styles.archivedRow,
        { backgroundColor: theme.glassCard, borderColor: theme.glassBorder, boxShadow: Elevation.card },
        pressed && { opacity: 0.75 },
      ]}>
      <View style={[styles.archivedIcon, { backgroundColor: theme.glassStrong }]}>
        <Icon
          name={open ? 'chevron.left' : 'archivebox.fill'}
          size={open ? 18 : 20}
          color={theme.textSecondary}
          fallback={open ? '‹' : '🗄'}
        />
      </View>
      <View style={styles.archivedBody}>
        <Text style={[styles.archivedTitle, { color: theme.text }]}>{open ? 'Back to Chats' : 'Archived'}</Text>
        {open ? null : (
          <>
            {unread > 0 ? <CountBadge count={unread} color={theme.textSecondary} /> : null}
            <Text style={[styles.archivedCount, { color: theme.textSecondary }]}>{count}</Text>
            <Icon name="chevron.right" size={13} color={theme.textSecondary} fallback="›" />
          </>
        )}
      </View>
    </Pressable>
  );
}

type RowPerson = { otherId: string; chat: Chat | null; story: StoryGroup | null };

/**
 * Story-style row: "Your Story" first, then people. A gradient ring means a story I
 * haven't seen (gray once seen); a green dot means they're active now. Tapping someone
 * with a story plays it (and the next unseen ones); otherwise it opens the chat.
 */
function ContactsRow({ chats, myUid, profiles }: {
  chats: Chat[];
  myUid: string;
  profiles: Record<string, UserProfile>;
}) {
  const { others } = useStories();
  const [sheet, setSheet] = useState(false);
  const people = new Map<string, RowPerson>();
  for (const chat of chats) {
    const otherId = otherMemberId(chat, myUid);
    people.set(otherId, { otherId, chat, story: null });
  }
  for (const group of others) {
    const existing = people.get(group.ownerId);
    people.set(group.ownerId, { otherId: group.ownerId, chat: existing?.chat ?? null, story: group });
  }
  const rank = (p: RowPerson) =>
    p.story?.unseen ? 0 : p.story ? 2 : isOnline(profiles[p.otherId]?.lastSeen) ? 1 : 3;
  const ordered = [...people.values()].sort((a, b) => rank(a) - rank(b));
  // Watching one person's stories rolls on to the next unseen ones.
  const unseenQueue = ordered.filter((p) => p.story?.unseen).map((p) => p.otherId);

  async function pickPhoto(source: 'library' | 'camera') {
    try {
      const image = await pickImage(source, 1080);
      if (!image) return;
      setStoryDraft(image);
      router.push({ pathname: '/story/new', params: { mode: 'photo' } });
    } catch (err) {
      toast.error(mediaErrorMessage(err));
    }
  }

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contacts}>
        <MyStoryBubble myUid={myUid} onAdd={() => setSheet(true)} />
        {ordered.map((person) => (
          <ContactBubble
            key={person.otherId}
            person={person}
            myUid={myUid}
            profile={profiles[person.otherId]}
            queue={unseenQueue.filter((id) => id !== person.otherId)}
          />
        ))}
      </ScrollView>
      <ActionSheet
        visible={sheet}
        title="Add to your story"
        onClose={() => setSheet(false)}
        options={[
          ...(Platform.OS !== 'web'
            ? [{ label: 'Camera', icon: 'camera.fill' as const, fallback: '📷', onPress: () => pickPhoto('camera') }]
            : []),
          { label: 'Photo', icon: 'photo.on.rectangle', fallback: '🖼', onPress: () => pickPhoto('library') },
          {
            label: 'Text',
            icon: 'textformat',
            fallback: 'Aa',
            onPress: () => router.push({ pathname: '/story/new', params: { mode: 'text' } }),
          },
        ]}
      />
    </>
  );
}

function MyStoryBubble({ myUid, onAdd }: { myUid: string; onAdd: () => void }) {
  const theme = useTheme();
  const { bubbleColor } = useAppearance();
  const { mine } = useStories();
  const me = useUserProfile(myUid);
  const has = mine.length > 0;
  return (
    <ScalePressable
      onPress={() => (has ? router.push({ pathname: '/story/[uid]', params: { uid: myUid } }) : onAdd())}
      onLongPress={onAdd}
      accessibilityRole="button"
      accessibilityLabel={has ? 'Your story. Long press to add more.' : 'Add to your story'}
      style={styles.contact}>
      <View>
        <PulseRing
          size={76}
          active={false}
          gradient=""
          idleColor={has ? bubbleColor : theme.backgroundElement}
          gap={theme.background}>
          <Avatar id={myUid} name={me?.name ?? '?'} size={62} uri={me?.avatarUrl} />
        </PulseRing>
        <Pressable
          onPress={onAdd}
          hitSlop={8}
          accessibilityLabel="Add to your story"
          style={[styles.addStory, { backgroundColor: bubbleColor, borderColor: theme.background }]}>
          <Icon name="plus" size={13} color="#fff" fallback="+" />
        </Pressable>
      </View>
      <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
        Your Story
      </Text>
      <Text style={[styles.contactStatus, { color: theme.textSecondary }]}>
        {has ? `${mine.length} ${mine.length === 1 ? 'story' : 'stories'}` : ' '}
      </Text>
    </ScalePressable>
  );
}

function ContactBubble({ person, myUid, profile, queue }: {
  person: RowPerson;
  myUid: string;
  profile: UserProfile | undefined;
  queue: string[];
}) {
  const theme = useTheme();
  const { bubbleColor } = useAppearance();
  const { otherId, chat, story } = person;
  const name = profile?.name ?? chat?.names?.[otherId] ?? 'Unknown';
  const online = isOnline(profile?.lastSeen);
  const unread = chat ? unreadFor(chat, myUid) : 0;

  function openChat() {
    router.push({ pathname: '/chat/[id]', params: { id: chatIdFor(myUid, otherId), otherId, name } });
  }
  function openStory() {
    router.push({ pathname: '/story/[uid]', params: { uid: otherId, queue: queue.join(',') } });
  }

  return (
    <ScalePressable
      onPress={story ? openStory : openChat}
      onLongPress={story ? openChat : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${name}${story ? (story.unseen ? ', new story' : ', story') : ''}${online ? ', active now' : ''}`}
      accessibilityHint={story ? 'Plays their story. Long press to open the chat.' : undefined}
      style={styles.contact}>
      <View>
        <PulseRing
          size={76}
          active={!!story?.unseen}
          gradient={`linear-gradient(135deg, ${bubbleColor} 0%, #FF6CAB 100%)`}
          idleColor={story ? theme.textSecondary : theme.backgroundElement}
          gap={theme.background}>
          <Avatar id={otherId} name={name} size={62} uri={profile?.avatarUrl} online={online} />
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
  transparent: { backgroundColor: 'transparent' },
  suggested: { marginTop: 10 },
  suggestedRow: { gap: 10, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12 },
  suggestCard: {
    width: 132,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestName: { fontSize: 15, fontWeight: '600', marginTop: 4, maxWidth: '100%' },
  suggestSub: { fontSize: 12 },
  sayHi: { marginTop: 8, height: 30, borderRadius: 15, paddingHorizontal: 14, justifyContent: 'center' },
  sayHiText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  section: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 4 },
  sectionTitle: { ...Type.footnote, fontWeight: '700', letterSpacing: 0.6 },
  sectionCount: { ...Type.footnote, opacity: 0.7 },
  card: {
    marginHorizontal: 12,
    marginVertical: 5,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  unreadBar: { position: 'absolute', left: 0, top: 18, bottom: 18, width: 3, borderRadius: 2 },
  greeting: { paddingHorizontal: Spacing.three + 4, paddingTop: 4, paddingBottom: 4, gap: 2 },
  greetingTitle: { ...Type.title3, fontWeight: '700' },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  greetingDot: { width: 7, height: 7, borderRadius: 4 },
  greetingSub: { ...Type.subhead },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, gap: 12 },
  rowBody: {
    flex: 1,
    minHeight: 78,
    justifyContent: 'center',
    paddingVertical: 11,
    paddingRight: Spacing.three,
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
  contact: { width: 80, alignItems: 'center' },
  addStory: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  actions: { flexDirection: 'row' },
  swipeAction: {
    width: SWIPE_ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  archivedRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, gap: 12 },
  archivedIcon: { width: 56, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  archivedBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 56,
    paddingRight: Spacing.three,
  },
  archivedTitle: { flex: 1, fontSize: 17, fontWeight: '600' },
  archivedCount: { fontSize: 15 },
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
