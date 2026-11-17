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
  View,
} from 'react-native';
import Animated, { FadeIn, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { Avatar } from '@/components/avatar';
import { useCalls } from '@/calls/context';
import { OfflineBanner } from '@/components/banners';
import { ChatHeaderTitle } from '@/components/chat/chat-header-title';
import { Composer } from '@/components/chat/composer';
import { MessageBubble } from '@/components/chat/message-bubble';
import { MessageMenu } from '@/components/chat/message-menu';
import { TypingBubble } from '@/components/chat/typing-bubble';
import { HeaderAction } from '@/components/header-action';
import { Icon } from '@/components/icon';
import { ListMessage } from '@/components/list-states';
import { WebBackButton } from '@/components/web-header';
import { Spacing } from '@/constants/theme';
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
  sendMessage,
  setTyping,
  toggleReaction,
  unsendMessage,
  type Chat,
  type Message,
  type ReplyRef,
} from '@/lib/chat';
import { db } from '@/lib/firebase';
import { haptics } from '@/lib/haptics';
import { mediaErrorMessage, pickImage, sendMediaMessage } from '@/lib/media';
import { setActiveChat } from '@/lib/push';
import { callsUnavailableReason } from '@/lib/runtime';

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
      { uid: otherId, name: name ?? 'User' }
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
        await editMessage(id, target.id, text, visible?.[0]?.id === target.id);
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

  // ── Voice call ──
  async function call() {
    if (!startCall) {
      showAlert('Voice calls', callsUnavailableReason() ?? 'Voice calls are connecting. Try again in a moment.');
      return;
    }
    if (iBlocked) {
      showAlert('Voice calls', `Unblock ${otherName} to call them.`);
      return;
    }
    try {
      haptics.medium();
      await startCall({ id: otherId, name: otherName });
    } catch {
      haptics.error();
      showAlert('Call failed', 'Could not start the call. Check your connection and try again.');
    }
  }

  // ── Photos and voice messages ──
  async function sendImage(source: 'library' | 'camera') {
    try {
      const image = await pickImage(source);
      if (!image) return;
      setBusyLabel('Sending photo…');
      await sendMediaMessage(id, myUid, otherId, { type: 'image', ...image });
      haptics.light();
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (err) {
      haptics.error();
      showAlert('Photo not sent', mediaErrorMessage(err));
    } finally {
      setBusyLabel(null);
    }
  }
  function attach() {
    if (Platform.OS === 'web') return sendImage('library');
    Alert.alert('Send a photo', undefined, [
      { text: 'Take Photo', onPress: () => sendImage('camera') },
      { text: 'Choose from Library', onPress: () => sendImage('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
  async function sendVoice(uri: string, durationMs: number) {
    try {
      setBusyLabel('Sending voice message…');
      await sendMediaMessage(id, myUid, otherId, { type: 'audio', uri, durationMs });
      haptics.light();
    } catch (err) {
      haptics.error();
      showAlert('Voice message not sent', mediaErrorMessage(err));
    } finally {
      setBusyLabel(null);
    }
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
  function reply() {
    if (!menuFor) return;
    const preview =
      menuFor.type === 'image' ? '📷 Photo' : menuFor.type === 'audio' ? '🎤 Voice message' : menuFor.text;
    setEditing(null);
    setReplyTo({ id: menuFor.id, text: preview, senderId: menuFor.senderId });
    setMenuFor(null);
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
    router.push({
      pathname: '/user/[id]',
      params: {
        id: otherId,
        name: otherName,
        report: '1',
        chatId: id,
        messageId: target.id,
        messageText: target.text || (target.type === 'image' ? '[photo]' : '[voice message]'),
      },
    });
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
      unsendMessage(id, target.id, isLatest).catch(() => haptics.error());
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Unsend this message? It will be removed for everyone.')) go();
      return;
    }
    Alert.alert('Unsend message?', 'It will be removed for everyone in this chat.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unsend', style: 'destructive', onPress: go },
    ]);
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
  const canLoadMore = !!messages && messages.length >= pageSize;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}>
      <Stack.Screen
        options={{
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
      <HeaderAction placement="right" icon="phone" label="Voice call" onPress={call} />

      <OfflineBanner />
      {!validChat ? (
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
                    onLongPress={openMenu}
                  />
                  {/* Like iOS: delivery status under my most recent message only. */}
                  {index === 0 && mine ? (
                    <Animated.Text
                      entering={FadeIn}
                      style={[styles.status, { color: theme.textSecondary }]}>
                      {item.pending
                        ? 'Sending…'
                        : otherReadAt >= sentAt
                          ? `Read ${formatMessageTime(chat?.lastRead?.[otherId] ?? null)}`
                          : 'Delivered'}
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

      {iBlocked ? (
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
          onAttach={attach}
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
