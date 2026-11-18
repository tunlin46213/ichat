import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import Animated, { FadeIn, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { ActionSheet, afterModalClose } from '@/components/action-sheet';
import { Avatar } from '@/components/avatar';
import { useCalls } from '@/calls/context';
import { OfflineBanner } from '@/components/banners';
import { ChatHeaderTitle } from '@/components/chat/chat-header-title';
import { Composer } from '@/components/chat/composer';
import { MessageBubble } from '@/components/chat/message-bubble';
import { MessageMenu } from '@/components/chat/message-menu';
import { PhotoViewer } from '@/components/chat/photo-viewer';
import { ReactionsSheet } from '@/components/chat/reactions-sheet';
import { TypingBubble } from '@/components/chat/typing-bubble';
import { HeaderActions } from '@/components/header-action';
import { Icon } from '@/components/icon';
import { ListMessage } from '@/components/list-states';
import { WebBackButton } from '@/components/web-header';
import { Spacing } from '@/constants/theme';
import { useAppearance, wallpaperGradient } from '@/context/appearance';
import { useAuth } from '@/context/auth';
import { useBlocks } from '@/context/blocks';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfile } from '@/hooks/use-user-profile';
import {
  canEdit,
  chatIdFor,
  editMessage,
  ensureChat,
  formatMessageTime,
  formatPresence,
  formatSeparator,
  isOnline,
  isTyping,
  markRead,
  needsSeparator,
  previewFor,
  sendLocation,
  sendMessage,
  setPinned,
  setTyping,
  toggleReaction,
  unsendMessage,
  type Chat,
  type Message,
  type ReplyRef,
} from '@/lib/chat';
import { db } from '@/lib/firebase';
import { canForward } from '@/lib/forward';
import { haptics } from '@/lib/haptics';
import { getCurrentCoords, locationErrorMessage } from '@/lib/location';
import { mediaErrorMessage, pickImages, sendMediaMessage } from '@/lib/media';
import { setActiveChat } from '@/lib/push';
import { callsUnavailableReason } from '@/lib/runtime';
import { isStarred, starMessage, unstarMessage, useStarred } from '@/lib/starred';

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/** A rejected send usually means the other person blocked me (rules check their block list). */
function sendErrorMessage(err: unknown, otherName: string) {
  const code = (err as { code?: string }).code ?? 'error';
  if (code === 'permission-denied') return `Message not delivered. ${otherName} may not be accepting messages.`;
  return `Message not sent (${code}).`;
}

const PAGE_SIZE = 50;

export default function ChatScreen() {
  const { id, otherId, name } = useLocalSearchParams<{ id: string; otherId: string; name: string }>();
  const { user, displayName } = useAuth();
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { wallpaper, bubbleColor } = useAppearance();
  const background = wallpaperGradient(wallpaper, scheme);
  const headerHeight = useHeaderHeight();
  const listRef = useRef<FlatList<Message>>(null);
  // Re-render every few seconds so "typing…" and presence labels stay current.
  useNow(4000);
  const myUid = user!.uid;

  const profile = useUserProfile(otherId);
  const { startCall } = useCalls();
  const { isBlocked, unblock } = useBlocks();
  const iBlocked = isBlocked(otherId);
  const otherName = profile?.name ?? name ?? 'Chat';

  const [ready, setReady] = useState(false);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  const [menuFor, setMenuFor] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [viewerStart, setViewerStart] = useState<number | null>(null);
  const [reactionsFor, setReactionsFor] = useState<Message | null>(null);
  const me = useUserProfile(myUid);
  const starred = useStarred(myUid);
  // Messages newer than this animate in; the initial history appears without animation.
  const [openedAt] = useState(() => Date.now());

  // Only allow opening the chat between me and otherId.
  const validChat = !!otherId && id === chatIdFor(myUid, otherId);

  // Make sure the chat document exists before reading messages (rules check membership).
  useEffect(() => {
    if (!validChat) return;
    let cancelled = false;
    ensureChat(
      { uid: myUid, name: displayName ?? user?.email ?? 'User' },
      { uid: otherId, name: name ?? '' }
    )
      .then(() => !cancelled && setReady(true))
      .catch((err) => !cancelled && setError(`Could not open chat (${err.code}).`));
    return () => {
      cancelled = true;
    };
  }, [validChat, myUid, otherId, name, displayName, user?.email]);

  // Messages, newest first (inverted list keeps the latest at the bottom).
  useEffect(() => {
    if (!ready) return;
    const q = query(
      collection(db, 'chats', id, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );
    return onSnapshot(
      q,
      // Metadata changes tell us when a sent message has reached the server.
      { includeMetadataChanges: true },
      (snap) => {
        setMessages(
          snap.docs.map(
            (d) =>
              ({
                id: d.id,
                ...d.data({ serverTimestamps: 'estimate' }),
                pending: d.metadata.hasPendingWrites,
              }) as Message
          )
        );
        setError(null);
      },
      (err) => setError(`Could not load messages (${err.code}).`)
    );
  }, [ready, id, pageSize]);

  // The chat doc: read markers, typing flags, unread counts, my "deleted at".
  useEffect(() => {
    if (!ready) return;
    return onSnapshot(doc(db, 'chats', id), (snap) =>
      setChat(snap.exists() ? ({ id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) } as Chat) : null)
    );
  }, [ready, id]);

  // Mark as read on open, whenever new messages arrive, and when the app returns.
  const myUnread = chat?.unread?.[myUid] ?? 0;
  useEffect(() => {
    if (!ready || AppState.currentState !== 'active') return;
    markRead(id, myUid).catch(() => {});
  }, [ready, id, myUid, myUnread]);
  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') markRead(id, myUid).catch(() => {});
    });
    return () => sub.remove();
  }, [ready, id, myUid]);

  // Don't show banner notifications for the chat that is on screen.
  useEffect(() => {
    setActiveChat(id);
    return () => setActiveChat(null);
  }, [id]);

  // Stop showing "typing…" to the other person when I leave the screen.
  useEffect(() => {
    if (!ready) return;
    return () => {
      setTyping(id, myUid, false).catch(() => {});
    };
  }, [ready, id, myUid]);

  async function handleSend(text: string) {
    haptics.light();
    if (editing) {
      const target = editing;
      setEditing(null);
      if (text === target.text) return true;
      try {
        await editMessage(id, target.id, text, {
          isLatest: visible?.[0]?.id === target.id,
          isPinned: chat?.pinned?.id === target.id,
        });
      } catch {
        haptics.error();
        setError('Could not edit the message.');
      }
      return true;
    }
    const reply = replyTo;
    setReplyTo(null);
    try {
      await sendMessage(id, myUid, otherId, text, reply);
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      return true;
    } catch (err) {
      haptics.error();
      setReplyTo(reply);
      setError(sendErrorMessage(err, otherName));
      return false;
    }
  }

  // ── Voice / video calls ──
  async function call(video = false) {
    if (!startCall) {
      showAlert(video ? 'Video calls' : 'Voice calls', callsUnavailableReason() ?? 'Calls are connecting. Try again in a moment.');
      return;
    }
    if (iBlocked) {
      showAlert(video ? 'Video calls' : 'Voice calls', `Unblock ${otherName} to call them.`);
      return;
    }
    try {
      haptics.medium();
      await startCall({ id: otherId, name: otherName }, { video });
    } catch (err) {
      haptics.error();
      console.warn('Call failed', err);
      const detail = err instanceof Error && err.message ? `\n\n(${err.message.slice(0, 200)})` : '';
      showAlert('Call failed', `Could not start the call. Check your connection and try again.${detail}`);
    }
  }

  // ── Photos, location and voice messages ──
  async function sendImages(source: 'library' | 'camera') {
    try {
      const photos = await pickImages(source);
      let failed: unknown = null;
      for (let i = 0; i < photos.length; i++) {
        setBusyLabel(photos.length > 1 ? `Sending photo ${i + 1} of ${photos.length}…` : 'Sending photo…');
        try {
          const image = await photos[i]();
          await sendMediaMessage(id, myUid, otherId, { type: 'image', ...image });
          haptics.light();
        } catch (err) {
          // Keep going with the rest; report once at the end.
          failed = err;
        }
      }
      if (photos.length) listRef.current?.scrollToOffset({ offset: 0, animated: true });
      if (failed) throw failed;
    } catch (err) {
      haptics.error();
      showAlert('Photo not sent', mediaErrorMessage(err));
    } finally {
      setBusyLabel(null);
    }
  }
  async function shareLocation() {
    try {
      setBusyLabel('Getting your location…');
      const coords = await getCurrentCoords();
      setBusyLabel('Sending location…');
      await sendLocation(id, myUid, otherId, coords);
      haptics.light();
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (err) {
      haptics.error();
      showAlert('Location not sent', locationErrorMessage(err));
    } finally {
      setBusyLabel(null);
    }
  }
  async function sendVoice(uri: string, durationMs: number, waveform: number[]) {
    try {
      setBusyLabel('Sending voice message…');
      await sendMediaMessage(id, myUid, otherId, { type: 'audio', uri, durationMs, waveform });
      haptics.light();
    } catch (err) {
      haptics.error();
      showAlert('Voice message not sent', mediaErrorMessage(err));
    } finally {
      setBusyLabel(null);
    }
  }

  // ── Search, pinned message, jumping to a message ──
  function jumpTo(messageId: string) {
    const index = visible?.findIndex((m) => m.id === messageId) ?? -1;
    if (index < 0) {
      showAlert('Message not loaded', 'Scroll up to load older messages, then try again.');
      return;
    }
    setSearching(false);
    setSearchText('');
    // Let the message list mount again (search replaces it) before scrolling.
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      setHighlightId(messageId);
      setTimeout(() => setHighlightId((h) => (h === messageId ? null : h)), 1800);
    }, 50);
  }
  function closeSearch() {
    setSearching(false);
    setSearchText('');
  }

  // ── Long-press menu actions ──
  function openMenu(message: Message) {
    if (message.pending) return;
    haptics.medium();
    setMenuFor(message);
  }
  function react(emoji: string) {
    if (!menuFor) return;
    haptics.light();
    toggleReaction(id, menuFor, myUid, emoji).catch(() => haptics.error());
    setMenuFor(null);
  }
  function startReply(message: Message) {
    setEditing(null);
    setReplyTo({ id: message.id, text: previewFor(message), senderId: message.senderId });
  }
  function reply() {
    if (!menuFor) return;
    startReply(menuFor);
    setMenuFor(null);
  }
  /** Double tap: ❤️, or remove it if it is already my reaction. */
  function like(message: Message) {
    haptics.light();
    toggleReaction(id, message, myUid, '❤️').catch(() => haptics.error());
  }
  function pin() {
    const target = menuFor;
    if (!target) return;
    setMenuFor(null);
    const unpin = chat?.pinned?.id === target.id;
    setPinned(
      id,
      unpin ? null : { id: target.id, text: previewFor(target).slice(0, 200), senderId: target.senderId }
    ).then(
      () => haptics.success(),
      () => haptics.error()
    );
  }
  function star() {
    const target = menuFor;
    if (!target) return;
    setMenuFor(null);
    const op = isStarred(starred, id, target.id)
      ? unstarMessage(myUid, id, target.id)
      : starMessage(myUid, id, target, { id: otherId, name: otherName });
    op.then(
      () => haptics.success(),
      () => haptics.error()
    );
  }
  function forward() {
    const target = menuFor;
    if (!target) return;
    setMenuFor(null);
    afterModalClose(() =>
      router.push({ pathname: '/users', params: { forwardChatId: id, forwardMessageId: target.id } })
    );
  }
  function edit() {
    if (!menuFor) return;
    setReplyTo(null);
    setEditing(menuFor);
    setMenuFor(null);
  }
  function report() {
    const target = menuFor;
    if (!target) return;
    setMenuFor(null);
    afterModalClose(() =>
      router.push({
        pathname: '/user/[id]',
        params: {
          id: otherId,
          name: otherName,
          report: '1',
          chatId: id,
          messageId: target.id,
          messageText: previewFor(target) || '[message]',
        },
      })
    );
  }
  function copy() {
    if (!menuFor) return;
    Clipboard.setStringAsync(menuFor.text).catch(() => {});
    haptics.success();
    setMenuFor(null);
  }
  function unsend() {
    const target = menuFor;
    if (!target) return;
    setMenuFor(null);
    const go = () => {
      const isLatest = visible?.[0]?.id === target.id;
      unsendMessage(id, target.id, { isLatest, isPinned: chat?.pinned?.id === target.id }).catch(() =>
        haptics.error()
      );
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Unsend this message? It will be removed for everyone.')) go();
      return;
    }
    afterModalClose(() =>
      Alert.alert('Unsend message?', 'It will be removed for everyone in this chat.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unsend', style: 'destructive', onPress: go },
      ])
    );
  }

  // If I deleted this chat earlier, only show messages that came after.
  const hiddenBefore = chat?.hiddenAt?.[myUid]?.toMillis() ?? 0;
  const visible =
    messages?.filter((m) => !hiddenBefore || (m.createdAt?.toMillis() ?? Infinity) > hiddenBefore) ??
    null;
  const hasMessages = !!visible && visible.length > 0;
  const otherTyping = isTyping(chat, otherId);
  const otherOnline = isOnline(profile?.lastSeen);
  const otherReadAt = chat?.lastRead?.[otherId]?.toMillis() ?? 0;
  // Messenger-style "seen" avatar sits under my newest message they have read.
  const lastReadMineId =
    visible?.find(
      (m) => m.senderId === myUid && !m.pending && (m.createdAt?.toMillis() ?? Infinity) <= otherReadAt
    )?.id ?? null;
  // Photos for the viewer, oldest first so swiping right goes forward in time.
  const photos = (visible ?? []).filter((m) => m.type === 'image' && m.mediaId && !m.deleted).reverse();
  const canLoadMore = !!messages && messages.length >= pageSize;
  const term = searchText.trim().toLowerCase();
  const results = term
    ? (visible ?? []).filter((m) => !m.deleted && previewFor(m).toLowerCase().includes(term))
    : [];
  const pinned = chat?.pinned ?? null;

  return (
    <KeyboardAvoidingView
      style={[
        styles.flex,
        { backgroundColor: theme.background },
        background ? { backgroundImage: background } : null,
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}>
      <Stack.Screen
        options={{
          // iOS 26+ makes the header transparent (Liquid Glass) by default. The inverted
          // message list can't use the system scroll-edge effect, so messages showed
          // through the header. An opaque header also means the screen starts below it,
          // which is what keyboardVerticalOffset={headerHeight} assumes.
          headerTransparent: false,
          headerStyle: { backgroundColor: theme.background },
          headerShadowVisible: false,
          headerTitle: () => (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/user/[id]', params: { id: otherId, name: otherName } })
              }
              accessibilityHint="Open contact info"
              hitSlop={6}>
              <ChatHeaderTitle
              id={otherId}
              name={otherName}
              status={formatPresence(profile?.lastSeen)}
              typing={otherTyping}
              online={otherOnline}
              avatarUrl={profile?.avatarUrl}
            />
            </Pressable>
          ),
          // Web: iOS-style "‹ Chats" back button (iOS draws its own natively).
          ...(Platform.OS === 'web' && {
            headerLeft: () => (
              <WebBackButton
                label="Chats"
                onPress={() =>
                  router.canGoBack() ? router.back() : router.replace('/chats' as Href)
                }
              />
            ),
          }),
        }}
      />
      <HeaderActions
        placement="right"
        buttons={[
          { icon: 'magnifyingglass', label: 'Search', onPress: () => setSearching(true) },
          { icon: 'video', label: 'Video call', onPress: () => call(true) },
          { icon: 'phone', label: 'Voice call', onPress: () => call(false) },
        ]}
      />

      <OfflineBanner />

      {searching ? (
        <View style={[styles.searchBar, { borderBottomColor: theme.separator, backgroundColor: theme.background }]}>
          <View style={[styles.searchField, { backgroundColor: theme.backgroundElement }]}>
            <Icon name="magnifyingglass" size={15} color={theme.textSecondary} fallback="🔍" />
            <TextInput
              autoFocus
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search in conversation"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="search"
              accessibilityLabel="Search in conversation"
              style={[styles.searchInput, { color: theme.text }]}
            />
          </View>
          <Pressable onPress={closeSearch} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.searchCancel, { color: bubbleColor }]}>Cancel</Text>
          </Pressable>
        </View>
      ) : pinned ? (
        <Pressable
          onPress={() => jumpTo(pinned.id)}
          accessibilityRole="button"
          accessibilityLabel={`Pinned message: ${pinned.text}. Tap to show it.`}
          style={[styles.pinned, { borderBottomColor: theme.separator, backgroundColor: theme.background }]}>
          <View style={[styles.pinnedBar, { backgroundColor: bubbleColor }]} />
          <View style={styles.flex}>
            <Text style={[styles.pinnedTitle, { color: bubbleColor }]}>Pinned message</Text>
            <Text style={[styles.pinnedText, { color: theme.text }]} numberOfLines={1}>
              {pinned.text}
            </Text>
          </View>
          <Pressable
            onPress={() => setPinned(id, null).catch(() => haptics.error())}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Unpin">
            <Icon name="xmark" size={14} color={theme.textSecondary} fallback="✕" />
          </Pressable>
        </Pressable>
      ) : null}

      {searching ? (
        <FlatList
          style={styles.flex}
          data={results}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <Text style={[styles.searchHint, { color: theme.textSecondary }]}>
              {term ? 'No messages found.' : 'Type to search messages in this chat.'}
            </Text>
          }
          ListFooterComponent={
            term && canLoadMore ? (
              <Pressable onPress={() => setPageSize((n) => n + PAGE_SIZE * 2)} style={styles.searchMore}>
                <Text style={[styles.searchHint, { color: bubbleColor }]}>
                  Searched the latest {visible?.length ?? 0} messages · Search older
                </Text>
              </Pressable>
            ) : undefined
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => jumpTo(item.id)}
              style={({ pressed }) => [
                styles.result,
                { borderBottomColor: theme.separator },
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}>
              <View style={styles.resultTop}>
                <Text style={[styles.resultName, { color: theme.text }]}>
                  {item.senderId === myUid ? 'You' : otherName}
                </Text>
                <Text style={[styles.resultTime, { color: theme.textSecondary }]}>
                  {formatSeparator(item.createdAt)}
                </Text>
              </View>
              <Text style={[styles.resultText, { color: theme.textSecondary }]} numberOfLines={2}>
                {previewFor(item)}
              </Text>
            </Pressable>
          )}
        />
      ) : !validChat ? (
        <ListMessage error="This chat link is not valid." />
      ) : !hasMessages ? (
        messages === null || error ? (
          <ListMessage loading={!error} error={error} />
        ) : (
          <View style={styles.intro}>
            <Animated.View entering={ZoomIn.springify().damping(14)}>
              <Avatar id={otherId} name={otherName} size={88} online={otherOnline} uri={profile?.avatarUrl} />
            </Animated.View>
            <Text style={[styles.introName, { color: theme.text }]}>{otherName}</Text>
            <Text style={[styles.introText, { color: theme.textSecondary }]}>
              {otherTyping ? 'typing…' : 'Say hi to start the conversation 👋'}
            </Text>
          </View>
        )
      ) : (
        <View style={styles.flex}>
          <FlatList
            ref={listRef}
            inverted
            data={visible}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => setShowJump(e.nativeEvent.contentOffset.y > 400)}
            scrollEventThrottle={100}
            onEndReachedThreshold={0.3}
            onEndReached={() => canLoadMore && setPageSize((n) => n + PAGE_SIZE)}
            onScrollToIndexFailed={(info) => {
              // Rows have different heights: get close first, then retry precisely.
              listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: false,
              });
              setTimeout(
                () =>
                  listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 }),
                120
              );
            }}
            // Inverted: the header sits at the bottom (typing bubble), the footer at the top.
            ListHeaderComponent={otherTyping ? <TypingBubble /> : undefined}
            ListFooterComponent={
              canLoadMore ? <ActivityIndicator style={styles.loadingMore} /> : undefined
            }
            renderItem={({ item, index }) => {
              // Newest-first: index - 1 is the newer message (below), index + 1 the older (above).
              const newer = visible[index - 1];
              const older = visible[index + 1];
              const mine = item.senderId === myUid;
              const separator = needsSeparator(older, item);
              const nextSeparated = newer ? needsSeparator(item, newer) : true;
              const lastInGroup = !newer || newer.senderId !== item.senderId || nextSeparated;
              const firstInGroup = separator || older.senderId !== item.senderId;
              const sentAt = item.createdAt?.toMillis() ?? Infinity;
              return (
                <View>
                  {separator ? (
                    <Text style={[styles.separator, { color: theme.textSecondary }]}>
                      {formatSeparator(item.createdAt)}
                    </Text>
                  ) : null}
                  <MessageBubble
                    chatId={id}
                    message={item}
                    mine={mine}
                    tail={lastInGroup}
                    spaced={firstInGroup}
                    animate={sentAt > openedAt}
                    myUid={myUid}
                    otherName={otherName}
                    starred={isStarred(starred, id, item.id)}
                    highlighted={highlightId === item.id}
                    onLongPress={openMenu}
                    onReply={startReply}
                    onDoubleTap={like}
                    onCallBack={(video) => call(video)}
                    onOpenImage={(m) => setViewerStart(Math.max(0, photos.findIndex((p) => p.id === m.id)))}
                    onShowReactions={setReactionsFor}
                  />
                  {item.id === lastReadMineId ? (
                    // Their little photo marks how far they have read.
                    <Animated.View
                      entering={FadeIn.duration(250)}
                      style={styles.seen}
                      accessibilityLabel={`Seen by ${otherName} at ${formatMessageTime(
                        chat?.lastRead?.[otherId] ?? null
                      )}`}>
                      <Avatar id={otherId} name={otherName} size={16} uri={profile?.avatarUrl} />
                    </Animated.View>
                  ) : index === 0 && mine ? (
                    <Animated.Text
                      entering={FadeIn}
                      style={[styles.status, { color: theme.textSecondary }]}>
                      {item.pending ? 'Sending…' : 'Delivered'}
                    </Animated.Text>
                  ) : null}
                </View>
              );
            }}
          />

          {showJump ? (
            <Animated.View
              entering={ZoomIn.duration(150)}
              exiting={ZoomOut.duration(120)}
              style={styles.jumpWrap}>
              <Pressable
                onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
                accessibilityLabel="Scroll to latest message"
                style={[styles.jump, { backgroundColor: theme.card }]}>
                <Icon name="chevron.down" size={18} color={theme.text} fallback="↓" />
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      )}

      {hasMessages && error ? <Text style={styles.inlineError}>{error}</Text> : null}

      {searching ? null : iBlocked ? (
        <View style={[styles.blocked, { borderTopColor: theme.separator }]}>
          <Text style={[styles.blockedText, { color: theme.textSecondary }]}>
            You blocked {otherName}. They can&apos;t message you.
          </Text>
          <Pressable
            onPress={() => unblock(otherId).then(() => haptics.success(), () => haptics.error())}
            accessibilityRole="button"
            hitSlop={8}>
            <Text style={styles.unblock}>Unblock</Text>
          </Pressable>
        </View>
      ) : (
        <Composer
          // Remount to load the message being edited into the field.
          key={editing?.id ?? 'compose'}
          initialText={editing?.text ?? ''}
          editing={!!editing}
          onCancelEdit={() => setEditing(null)}
          enabled={validChat && ready}
          replyTo={replyTo}
          replyAuthor={replyTo?.senderId === myUid ? 'yourself' : otherName}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleSend}
          onTyping={(typing) => setTyping(id, myUid, typing).catch(() => {})}
          onAttach={() => setAttachOpen(true)}
          onVoice={sendVoice}
          busyLabel={busyLabel}
        />
      )}

      <MessageMenu
        message={menuFor}
        mine={menuFor?.senderId === myUid}
        myReaction={menuFor?.reactions?.[myUid]}
        onClose={() => setMenuFor(null)}
        onReact={react}
        onReply={reply}
        onCopy={copy}
        onUnsend={unsend}
        onEdit={menuFor && canEdit(menuFor, myUid) ? edit : undefined}
        onReport={menuFor && menuFor.senderId !== myUid ? report : undefined}
        pinned={!!menuFor && pinned?.id === menuFor.id}
        onPin={pin}
        starred={!!menuFor && isStarred(starred, id, menuFor.id)}
        onStar={star}
        onForward={menuFor && canForward(menuFor) ? forward : undefined}
      />

      {viewerStart !== null && photos.length ? (
        <PhotoViewer
          chatId={id}
          photos={photos}
          startIndex={Math.min(viewerStart, photos.length - 1)}
          senderName={(uid) => (uid === myUid ? 'You' : otherName)}
          onClose={() => setViewerStart(null)}
        />
      ) : null}

      <ReactionsSheet
        message={reactionsFor}
        myUid={myUid}
        people={{
          [myUid]: { name: displayName ?? 'You', avatarUrl: me?.avatarUrl },
          [otherId]: { name: otherName, avatarUrl: profile?.avatarUrl },
        }}
        onClose={() => setReactionsFor(null)}
        onRemoveMine={() => {
          const target = reactionsFor;
          setReactionsFor(null);
          const emoji = target?.reactions?.[myUid];
          if (target && emoji) toggleReaction(id, target, myUid, emoji).catch(() => haptics.error());
        }}
      />

      <ActionSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        options={[
          ...(Platform.OS !== 'web'
            ? [{ label: 'Camera', icon: 'camera.fill' as const, fallback: '📷', onPress: () => sendImages('camera') }]
            : []),
          { label: 'Photos', icon: 'photo.on.rectangle', fallback: '🖼', onPress: () => sendImages('library') },
          { label: 'Location', icon: 'location.fill', fallback: '📍', onPress: shareLocation },
        ]}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: 12, paddingVertical: Spacing.two },
  intro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  introName: { fontSize: 22, fontWeight: '600', marginTop: Spacing.two },
  introText: { fontSize: 15 },
  separator: {
    alignSelf: 'center',
    fontSize: 12,
    fontWeight: '500',
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
  },
  status: { alignSelf: 'flex-end', fontSize: 11, fontWeight: '500', marginTop: 3, marginRight: 4 },
  seen: { alignSelf: 'flex-end', marginTop: 3, marginRight: 2 },
  loadingMore: { marginVertical: Spacing.three },
  jumpWrap: { position: 'absolute', right: 14, bottom: 12 },
  jump: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  searchCancel: { fontSize: 17 },
  searchHint: { textAlign: 'center', fontSize: 15, padding: Spacing.four },
  searchMore: { paddingBottom: Spacing.four },
  result: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  resultTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  resultName: { fontSize: 15, fontWeight: '600' },
  resultTime: { fontSize: 13 },
  resultText: { fontSize: 15, lineHeight: 20 },
  pinned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pinnedBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  pinnedTitle: { fontSize: 13, fontWeight: '600' },
  pinnedText: { fontSize: 14 },
  blocked: {
    alignItems: 'center',
    gap: 6,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    paddingHorizontal: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  blockedText: { fontSize: 14, textAlign: 'center' },
  unblock: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  inlineError: { color: '#E5484D', textAlign: 'center', paddingVertical: 4, fontSize: 13 },
});
