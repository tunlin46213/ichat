import { router, Stack, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { toast } from '@/components/toast';
import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { HeaderAction } from '@/components/header-action';
import { ListMessage } from '@/components/list-states';
import { SkeletonRows } from '@/components/skeleton';
import { InlineSearch } from '@/components/web-header';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useBlocks } from '@/context/blocks';
import { useTheme } from '@/hooks/use-theme';
import { chatIdFor, type Message, type UserProfile } from '@/lib/chat';
import { db } from '@/lib/firebase';
import { forwardMessage } from '@/lib/forward';
import { shareMomentToChat } from '@/lib/moments';

/**
 * New-chat picker. With `forwardChatId` + `forwardMessageId` it becomes "Forward to…":
 * picking a person sends them a copy of that message and opens the chat.
 */
export default function UsersScreen() {
  const { forwardChatId, forwardMessageId, shareMomentId, shareMomentAuthor } = useLocalSearchParams<{
    forwardChatId?: string;
    forwardMessageId?: string;
    /** "Send to…" a moment (Moments → Share) */
    shareMomentId?: string;
    shareMomentAuthor?: string;
  }>();
  const sharing = !!shareMomentId;
  const forwarding = (!!forwardChatId && !!forwardMessageId) || sharing;
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const { user, displayName } = useAuth();
  const theme = useTheme();
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { blocked } = useBlocks();
  const myUid = user!.uid;

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('nameLower'));
    return onSnapshot(
      q,
      (snap) => {
        setUsers(
          snap.docs
            .filter((d) => d.id !== myUid)
            .map((d) => ({ id: d.id, ...d.data() }) as UserProfile)
        );
        setError(null);
      },
      (err) => setError(`Could not load users (${err.code}).`)
    );
  }, [myUid]);

  async function forwardTo(person: UserProfile) {
    if (sendingTo) return;
    setSendingTo(person.id);
    if (sharing) {
      try {
        const chatId = await shareMomentToChat(
          shareMomentId!,
          { uid: myUid, name: displayName ?? 'User' },
          { uid: person.id, name: person.name },
          shareMomentAuthor ?? 'Someone'
        );
        toast.success(`Sent to ${person.name}`, 'paperplane.fill');
        router.replace({ pathname: '/chat/[id]', params: { id: chatId, otherId: person.id, name: person.name } });
      } catch {
        setSendingTo(null);
        toast.error(`Could not send it to ${person.name}. Try again.`);
      }
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'chats', forwardChatId!, 'messages', forwardMessageId!));
      if (!snap.exists()) throw new Error('missing');
      const message = { id: snap.id, ...snap.data() } as Message;
      const chatId = await forwardMessage(
        forwardChatId!,
        message,
        { uid: myUid, name: displayName ?? 'User' },
        { uid: person.id, name: person.name }
      );
      toast.success(`Forwarded to ${person.name}`, 'arrowshape.turn.up.right.fill');
      router.replace({
        pathname: '/chat/[id]',
        params: { id: chatId, otherId: person.id, name: person.name },
      });
    } catch {
      setSendingTo(null);
      toast.error(`Could not forward to ${person.name}. Try again.`);
    }
  }

  const term = search.trim().toLowerCase();
  const shown =
    users?.filter((u) => !blocked.includes(u.id) && u.name.toLowerCase().includes(term)) ?? null;

  return (
    <>
      <Stack.Screen options={{ title: sharing ? 'Send to…' : forwarding ? 'Forward to…' : 'New Chat' }} />
      <HeaderAction placement="left" label="Cancel" onPress={() => router.back()} />
      <Stack.SearchBar
        placeholder="Search people"
        hideWhenScrolling={false}
        onChangeText={(e) => setSearch(e.nativeEvent.text)}
        onCancelButtonPress={() => setSearch('')}
      />
      <FlatList
        style={{ backgroundColor: theme.background }}
        data={shown ?? []}
        keyExtractor={(u) => u.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={shown?.length ? undefined : styles.emptyContainer}
        ListHeaderComponent={
          <>
            {/* Web has no native header search bar; renders nothing on iOS. */}
            <View style={Platform.OS === 'web' ? styles.webSearch : undefined}>
              <InlineSearch value={search} onChangeText={setSearch} placeholder="Search people" />
            </View>
            {shown?.length ? (
              <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
                {term ? 'RESULTS' : 'PEOPLE ON ICHAT'}
              </Text>
            ) : null}
          </>
        }
        ListEmptyComponent={
          shown === null && !error ? (
            <SkeletonRows count={8} avatarSize={40} lines={1} />
          ) : (
            <ListMessage
              error={error}
              empty={term ? 'No one matches that name.' : 'No other users yet.\nAsk a friend to register.'}
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            disabled={!!sendingTo}
            onPress={() =>
              forwarding
                ? forwardTo(item)
                : // Replace the sheet with the chat, so "back" from the chat returns to the list.
                  router.replace({
                    pathname: '/chat/[id]',
                    params: { id: chatIdFor(myUid, item.id), otherId: item.id, name: item.name },
                  })
            }
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: theme.backgroundSelected },
            ]}>
            <Avatar id={item.id} name={item.name} size={40} uri={item.avatarUrl} />
            <View style={[styles.rowBody, { borderBottomColor: theme.separator }]}>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {sendingTo === item.id ? (
                <ActivityIndicator style={styles.spinner} />
              ) : !forwarding ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id, name: item.name } })}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, view profile`}
                  style={styles.info}>
                  <Icon name="info.circle" size={22} color={theme.accent} fallback="ⓘ" />
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  info: { paddingHorizontal: 4, marginRight: Spacing.three },
  emptyContainer: { flexGrow: 1 },
  webSearch: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  sectionHeader: {
    fontSize: 13,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.three, gap: 12 },
  rowBody: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { flex: 1, fontSize: 17 },
  spinner: { marginRight: Spacing.three },
});
