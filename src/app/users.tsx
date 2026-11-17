import { router, Stack } from 'expo-router';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { HeaderAction } from '@/components/header-action';
import { ListMessage } from '@/components/list-states';
import { SkeletonRows } from '@/components/skeleton';
import { InlineSearch } from '@/components/web-header';
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
    <>
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
            onPress={() =>
              // Replace the sheet with the chat, so "back" from the chat returns to the list.
              router.replace({
                pathname: '/chat/[id]',
                params: { id: chatIdFor(myUid, item.id), otherId: item.id, name: item.name },
              })
            }
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: theme.backgroundSelected },
            ]}>
            <Avatar id={item.id} name={item.name} size={40} />
            <View style={[styles.rowBody, { borderBottomColor: theme.separator }]}>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 17 },
});
