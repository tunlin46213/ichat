import { router, Stack } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ListMessage } from '@/components/list-states';
import { Accent, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { formatChatTime, otherMemberId, type Chat } from '@/lib/chat';
import { db } from '@/lib/firebase';

export default function ChatsScreen() {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const myUid = user!.uid;

  useEffect(() => {
    // Sorted on the client so Firestore doesn't need a composite index.
    const q = query(collection(db, 'chats'), where('members', 'array-contains', myUid));
    return onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Chat)
          // A chat opened but never written to has no lastMessage yet; hide it.
          .filter((c) => c.lastMessage != null)
          .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));
        setChats(list);
        setError(null);
      },
      (err) => setError(`Could not load chats (${err.code}).`)
    );
  }, [myUid]);

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <HeaderButton title="Log out" onPress={logout} />
          ),
          headerRight: () => (
            <HeaderButton title="New" bold onPress={() => router.push('/users')} />
          ),
        }}
      />
      {chats === null || chats.length === 0 ? (
        <ListMessage
          loading={chats === null && !error}
          error={error}
          empty={'No chats yet.\nTap "New" to start one.'}
        />
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.id}
          contentInsetAdjustmentBehavior="automatic"
          renderItem={({ item }) => {
            const otherId = otherMemberId(item, myUid);
            const name = item.names?.[otherId] ?? 'Unknown';
            const preview = item.lastSenderId === myUid ? `You: ${item.lastMessage}` : item.lastMessage;
            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/chat/[id]',
                    params: { id: item.id, otherId, name },
                  })
                }
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: theme.backgroundElement },
                ]}>
                <Avatar id={otherId} name={name} />
                <View style={[styles.rowBody, { borderBottomColor: theme.backgroundSelected }]}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.time, { color: theme.textSecondary }]}>
                      {formatChatTime(item.updatedAt)}
                    </Text>
                  </View>
                  <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={1}>
                    {preview}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function HeaderButton({ title, onPress, bold }: {
  title: string;
  onPress: () => void;
  bold?: boolean;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.headerButton}>
      <Text style={[styles.headerButtonText, bold && { fontWeight: '600' }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.three, gap: 12 },
  rowBody: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  name: { flex: 1, fontSize: 17, fontWeight: '600' },
  time: { fontSize: 13 },
  preview: { fontSize: 15 },
  headerButton: { paddingHorizontal: 4 },
  headerButtonText: { color: Accent, fontSize: 17 },
});
