import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { ListMessage } from '@/components/list-states';
import { WebBackButton } from '@/components/web-header';
import { Accent, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useTheme } from '@/hooks/use-theme';
import {
  chatIdFor,
  ensureChat,
  formatDayLabel,
  formatMessageTime,
  isSameDay,
  sendMessage,
  type Chat,
  type Message,
} from '@/lib/chat';
import { db } from '@/lib/firebase';
import { haptics } from '@/lib/haptics';

const PAGE_SIZE = 100;

export default function ChatScreen() {
  const { id, otherId, name } = useLocalSearchParams<{ id: string; otherId: string; name: string }>();
  const { user, displayName } = useAuth();
  const theme = useTheme();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const myUid = user!.uid;
  const otherName = name || 'Chat';

  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [hiddenBefore, setHiddenBefore] = useState(0);
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

  useEffect(() => {
    if (!ready) return;
    // Newest first, shown in an inverted list so the latest message sits at the bottom.
    const q = query(
      collection(db, 'chats', id, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
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
                // 'estimate' gives a just-sent message a local time until the server stamps it.
                ...d.data({ serverTimestamps: 'estimate' }),
                pending: d.metadata.hasPendingWrites,
              }) as Message
          )
        );
        setError(null);
      },
      (err) => setError(`Could not load messages (${err.code}).`)
    );
  }, [ready, id]);

  // If I deleted this chat earlier, only show messages that came after.
  useEffect(() => {
    if (!ready) return;
    return onSnapshot(doc(db, 'chats', id), (snap) => {
      const hidden = (snap.data() as Chat | undefined)?.hiddenAt?.[myUid];
      setHiddenBefore(hidden ? hidden.toMillis() : 0);
    });
  }, [ready, id, myUid]);

  async function onSend() {
    const text = draft.trim();
    if (!text || sending) return;
    haptics.light();
    setSending(true);
    setDraft('');
    try {
      await sendMessage(id, myUid, text);
    } catch (err) {
      haptics.error();
      setDraft(text); // give the text back so it isn't lost
      setError(`Message not sent (${(err as { code?: string }).code ?? 'error'}).`);
    } finally {
      setSending(false);
    }
  }

  const canSend = ready && draft.trim().length > 0 && !sending;
  const visible =
    messages?.filter((m) => !hiddenBefore || (m.createdAt?.toMillis() ?? Infinity) > hiddenBefore) ??
    null;
  const hasMessages = !!visible && visible.length > 0;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}>
      <Stack.Screen
        options={{
          title: otherName,
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

      {!validChat ? (
        <ListMessage error="This chat link is not valid." />
      ) : !hasMessages ? (
        messages === null || error ? (
          <ListMessage loading={!error} error={error} />
        ) : (
          <View style={styles.intro}>
            <Avatar id={otherId} name={otherName} size={80} />
            <Text style={[styles.introName, { color: theme.text }]}>{otherName}</Text>
            <Text style={[styles.introText, { color: theme.textSecondary }]}>
              Say hi to start the conversation 👋
            </Text>
          </View>
        )
      ) : (
        <FlatList
          inverted
          data={visible}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            // The list is newest-first: index - 1 is the newer message (below),
            // index + 1 the older one (above).
            const newer = visible[index - 1];
            const older = visible[index + 1];
            const mine = item.senderId === myUid;
            const startsDay = !older || !isSameDay(older.createdAt, item.createdAt);
            const lastInGroup =
              !newer ||
              newer.senderId !== item.senderId ||
              !isSameDay(newer.createdAt, item.createdAt);
            const firstInGroup = startsDay || older.senderId !== item.senderId;
            return (
              <View>
                {startsDay ? (
                  <Text style={[styles.day, { color: theme.textSecondary }]}>
                    {formatDayLabel(item.createdAt)}
                  </Text>
                ) : null}
                <Bubble
                  message={item}
                  mine={mine}
                  tail={lastInGroup}
                  spaced={firstInGroup}
                  animate={(item.createdAt?.toMillis() ?? Infinity) > openedAt}
                />
                {/* Like iOS: status under my most recent message only. */}
                {index === 0 && mine ? (
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
      )}

      {hasMessages && error ? <Text style={styles.inlineError}>{error}</Text> : null}

      <View
        style={[
          styles.composer,
          {
            // Home-indicator space only matters while the keyboard is hidden.
            paddingBottom: keyboardVisible ? Spacing.two : Math.max(insets.bottom, Spacing.two),
            borderTopColor: theme.separator,
            backgroundColor: theme.background,
          },
        ]}>
        <View style={[styles.inputWrap, { borderColor: theme.separator }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={2000}
            editable={validChat}
            style={[styles.input, { color: theme.text }]}
          />
          <SendButton active={canSend} onPress={onSend} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Round ↑ button that springs in when there is text to send. */
function SendButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  const theme = useTheme();
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(active ? 1 : 0.85, { damping: 14, stiffness: 300 }) }],
  }));
  return (
    <Pressable
      onPress={onPress}
      disabled={!active}
      accessibilityRole="button"
      accessibilityLabel="Send"
      hitSlop={6}>
      <Animated.View
        style={[
          styles.send,
          { backgroundColor: active ? Accent : theme.backgroundSelected },
          animated,
        ]}>
        <Icon name="arrow.up" size={15} color="#fff" fallback="↑" />
      </Animated.View>
    </Pressable>
  );
}

function Bubble({ message, mine, tail, spaced, animate }: {
  message: Message;
  mine: boolean;
  /** last message of a run from the same sender: gets the squared "tail" corner */
  tail: boolean;
  /** first message of a run: extra space above it */
  spaced: boolean;
  /** pop in with a spring (new messages only, not the loaded history) */
  animate: boolean;
}) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={
        animate
          ? FadeInDown.springify().damping(16)
          : undefined
      }
      style={[
        styles.bubbleRow,
        mine ? styles.right : styles.left,
        { marginTop: spaced ? 8 : 2, opacity: message.pending ? 0.75 : 1 },
      ]}>
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: Accent, borderBottomRightRadius: tail ? 5 : 18 }
            : { backgroundColor: theme.bubbleIncoming, borderBottomLeftRadius: tail ? 5 : 18 },
        ]}>
        <Text style={[styles.bubbleText, { color: mine ? '#fff' : theme.text }]}>
          {message.text}
          {/* Invisible spacer reserves room so the time never overlaps the last line. */}
          <Text style={styles.timeSpacer}>{'  ' + formatMessageTime(message.createdAt)}</Text>
        </Text>
        <Text
          style={[
            styles.bubbleTime,
            { color: mine ? 'rgba(255,255,255,0.7)' : theme.textSecondary },
          ]}>
          {formatMessageTime(message.createdAt)}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: 12, paddingVertical: Spacing.two },
  intro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  introName: { fontSize: 22, fontWeight: '600', marginTop: Spacing.two },
  introText: { fontSize: 15 },
  day: {
    alignSelf: 'center',
    fontSize: 12,
    fontWeight: '600',
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
  },
  bubbleRow: { flexDirection: 'row' },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  bubbleText: { fontSize: 17, lineHeight: 22 },
  timeSpacer: { fontSize: 11, color: 'transparent' },
  bubbleTime: { position: 'absolute', right: 10, bottom: 5, fontSize: 11 },
  status: { alignSelf: 'flex-end', fontSize: 11, fontWeight: '500', marginTop: 3, marginRight: 4 },
  inlineError: { color: '#E5484D', textAlign: 'center', paddingVertical: 4, fontSize: 13 },
  composer: {
    paddingHorizontal: 10,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 20,
    paddingLeft: 14,
    paddingRight: 4,
    minHeight: 38,
  },
  input: {
    flex: 1,
    fontSize: 17,
    maxHeight: 130,
    paddingTop: 8,
    paddingBottom: 8,
  },
  send: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    marginLeft: 6,
  },
});
