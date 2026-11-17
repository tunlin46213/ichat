import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ListMessage } from '@/components/list-states';
import { Accent, Spacing } from '@/constants/theme';
import { useBlocks } from '@/context/blocks';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfile } from '@/hooks/use-user-profile';
import { haptics } from '@/lib/haptics';

export default function BlockedUsersScreen() {
  const { blocked } = useBlocks();
  const theme = useTheme();
  return (
    <FlatList
      style={{ backgroundColor: theme.groupedBackground }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={blocked.length ? styles.content : styles.empty}
      data={blocked}
      keyExtractor={(uid) => uid}
      ListEmptyComponent={<ListMessage empty="You haven't blocked anyone." />}
      ListFooterComponent={
        blocked.length ? (
          <Text style={[styles.footer, { color: theme.textSecondary }]}>
            Blocked people can&apos;t message you. They aren&apos;t notified.
          </Text>
        ) : undefined
      }
      renderItem={({ item, index }) => (
        <BlockedRow uid={item} first={index === 0} last={index === blocked.length - 1} />
      )}
    />
  );
}

function BlockedRow({ uid, first, last }: { uid: string; first: boolean; last: boolean }) {
  const { unblock } = useBlocks();
  const theme = useTheme();
  const profile = useUserProfile(uid);
  const name = profile?.name ?? 'Deleted user';
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.card },
        first && styles.first,
        last && styles.last,
      ]}>
      <Avatar id={uid} name={name} size={40} uri={profile?.avatarUrl} />
      <View style={[styles.rowBody, !last && { borderBottomColor: theme.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Pressable
          onPress={() => unblock(uid).then(() => haptics.success(), () => haptics.error())}
          hitSlop={8}
          accessibilityRole="button">
          <Text style={styles.unblock}>Unblock</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three },
  empty: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.three, gap: 12 },
  first: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  last: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingRight: Spacing.three,
  },
  name: { flex: 1, fontSize: 17 },
  unblock: { color: Accent, fontSize: 16, fontWeight: '600' },
  footer: { fontSize: 13, marginTop: Spacing.two, marginHorizontal: Spacing.three },
});
