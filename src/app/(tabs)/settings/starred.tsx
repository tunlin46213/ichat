import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { ListMessage } from '@/components/list-states';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { formatChatTime } from '@/lib/chat';
import { haptics } from '@/lib/haptics';
import { unstarMessage, useStarred, type StarredItem } from '@/lib/starred';

/** Messages I starred, across all chats. Tap to open the chat; ★ to unstar. */
export default function StarredScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const items = useStarred(user?.uid);

  return (
    <FlatList
      style={{ backgroundColor: theme.groupedBackground }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={items?.length ? styles.content : styles.empty}
      data={items ?? []}
      keyExtractor={(i) => `${i.chatId}/${i.messageId}`}
      ListEmptyComponent={
        <ListMessage
          loading={items === null}
          empty={'No starred messages.\nLong-press a message and tap Star to save it here.'}
        />
      }
      renderItem={({ item, index }) => (
        <StarredRow
          item={item}
          myUid={user!.uid}
          first={index === 0}
          last={index === (items?.length ?? 0) - 1}
        />
      )}
    />
  );
}

function StarredRow({ item, myUid, first, last }: {
  item: StarredItem;
  myUid: string;
  first: boolean;
  last: boolean;
}) {
  const theme = useTheme();
  const fromMe = item.senderId === myUid;
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/chat/[id]',
          params: { id: item.chatId, otherId: item.otherId, name: item.otherName },
        })
      }
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.card },
        first && styles.first,
        last && styles.last,
      ]}>
      <Avatar id={fromMe ? myUid : item.otherId} name={fromMe ? 'You' : item.otherName} size={36} />
      <View
        style={[
          styles.body,
          !last && { borderBottomColor: theme.separator, borderBottomWidth: StyleSheet.hairlineWidth },
        ]}>
        <View style={styles.top}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {fromMe ? `You → ${item.otherName}` : item.otherName}
          </Text>
          <Text style={[styles.time, { color: theme.textSecondary }]}>{formatChatTime(item.starredAt)}</Text>
        </View>
        <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={3}>
          {item.preview || 'Message'}
        </Text>
      </View>
      <Pressable
        onPress={() =>
          unstarMessage(myUid, item.chatId, item.messageId).then(
            () => haptics.light(),
            () => haptics.error()
          )
        }
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Unstar"
        style={styles.star}>
        <Icon name="star.fill" size={18} color="#FFCC00" fallback="★" />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three },
  empty: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: Spacing.three, gap: 12, paddingTop: 10 },
  first: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  last: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  body: { flex: 1, paddingBottom: 10, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '600' },
  time: { fontSize: 13 },
  preview: { fontSize: 15, lineHeight: 20 },
  star: { paddingHorizontal: Spacing.three, paddingTop: 2 },
});
