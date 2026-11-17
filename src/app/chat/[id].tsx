import { Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListMessage } from '@/components/list-states';
import { Accent, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { chatIdFor, ensureChat, formatMessageTime, sendMessage, type Message } from '@/lib/chat';
import { db } from '@/lib/firebase';

const PAGE_SIZE = 100;

export default function ChatScreen() {
  const { id, otherId, name } = useLocalSearchParams<{ id: string; otherId: string; name: string }>();
  const { user, displayName } = useAuth();
  const theme = useTheme();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const myUid = user!.uid;

  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

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
      (snap) => {
        setMessages(
          snap.docs.map(
            // 'estimate' gives a just-sent message a local time until the server stamps it.
            (d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Message
          )
        );
        setError(null);
      },
      (err) => setError(`Could not load messages (${err.code}).`)
    );
  }, [ready, id]);

  async function onSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      await sendMessage(id, myUid, text);
    } catch (err) {
      setDraft(text); // give the text back so it isn't lost
      setError(`Message not sent (${(err as { code?: string }).code ?? 'error'}).`);
    } finally {
      setSending(false);
    }
  }

  const canSend = ready && draft.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}>
      <Stack.Screen options={{ title: name ?? 'Chat' }} />

      {!validChat ? (
        <ListMessage error="This chat link is not valid." />
      ) : messages === null || messages.length === 0 ? (
        <ListMessage
          loading={messages === null && !error}
          error={error}
          empty={`Say hi to ${name ?? 'your friend'} 👋`}
        />
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <Bubble message={item} mine={item.senderId === myUid} />}
        />
      )}

      {validChat && messages && messages.length > 0 && error ? (
        <Text style={styles.inlineError}>{error}</Text>
      ) : null}

      <View
        style={[
          styles.composer,
          {
            paddingBottom: Math.max(insets.bottom, Spacing.two),
            borderTopColor: theme.backgroundSelected,
            backgroundColor: theme.background,
          },
        ]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={2000}
          editable={validChat}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={[styles.send, { opacity: canSend ? 1 : 0.4 }]}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, mine }: { message: Message; mine: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.bubbleRow, mine ? styles.right : styles.left]}>
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: Accent, borderBottomRightRadius: 4 }
            : { backgroundColor: theme.backgroundElement, borderBottomLeftRadius: 4 },
        ]}>
        <Text style={[styles.bubbleText, { color: mine ? '#fff' : theme.text }]}>
          {message.text}
        </Text>
        <Text
          style={[
            styles.bubbleTime,
            { color: mine ? 'rgba(255,255,255,0.75)' : theme.textSecondary },
          ]}>
          {formatMessageTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  bubbleRow: { flexDirection: 'row', marginVertical: 3 },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 18,
  },
  bubbleText: { fontSize: 16, lineHeight: 21 },
  bubbleTime: { fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },
  inlineError: { color: '#E5484D', textAlign: 'center', paddingVertical: 4, fontSize: 13 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    borderRadius: 20,
  },
  send: {
    backgroundColor: Accent,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
