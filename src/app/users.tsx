import { router } from 'expo-router';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ListMessage } from '@/components/list-states';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { chatIdFor, type UserProfile } from '@/lib/chat';
import { db } from '@/lib/firebase';

export default function UsersScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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

  const term = search.trim().toLowerCase();
  const shown = users?.filter((u) => u.name.toLowerCase().includes(term)) ?? null;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name"
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
      </View>
      {shown === null || shown.length === 0 ? (
        <ListMessage
          loading={shown === null && !error}
          error={error}
          empty={term ? 'No one matches that name.' : 'No other users yet.'}
        />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(u) => u.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                // Replace so "back" from the chat returns to the chat list, not here.
                router.replace({
                  pathname: '/chat/[id]',
                  params: { id: chatIdFor(myUid, item.id), otherId: item.id, name: item.name },
                })
              }
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: theme.backgroundElement },
              ]}>
              <Avatar id={item.id} name={item.name} size={40} />
              <View style={[styles.rowBody, { borderBottomColor: theme.backgroundSelected }]}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchWrap: { padding: Spacing.three, paddingBottom: Spacing.two },
  search: { fontSize: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.three, gap: 12 },
  rowBody: {
    flex: 1,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 17 },
});
