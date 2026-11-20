import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { MomentCard, timeAgo } from '@/components/moments/moment-card';
import { toast } from '@/components/toast';
import { WebBackButton } from '@/components/web-header';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useBlocks } from '@/context/blocks';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import { confirmDestructive } from '@/lib/confirm';
import { haptics } from '@/lib/haptics';
import { addComment, deleteComment, MAX_COMMENT_TEXT, useComments, useMoment } from '@/lib/moments';

/** One moment with all its comments, and a field to add one. */
export default function MomentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myUid = user!.uid;
  const moment = useMoment(id);
  const { blocked } = useBlocks();
  const allComments = useComments(id);
  const comments = allComments?.filter((c) => !blocked.includes(c.authorId)) ?? null;
  const now = useNow(60_000);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const profiles = useUserProfiles([
    myUid,
    ...(moment ? [moment.authorId, ...Object.keys(moment.likes ?? {})] : []),
    ...(comments ?? []).map((c) => c.authorId),
  ]);

  // Deleted while open (or a dead link from an alert): leave.
  useEffect(() => {
    if (moment !== null) return;
    if (router.canGoBack()) router.back();
    else router.replace('/moments' as Href);
  }, [moment]);

  async function send() {
    const clean = text.trim();
    if (!clean || sending || !moment) return;
    setSending(true);
    try {
      await addComment(moment.id, myUid, clean);
      setText('');
      haptics.light();
    } catch {
      toast.error('Could not post the comment. Try again.');
    } finally {
      setSending(false);
    }
  }

  function remove(commentId: string) {
    confirmDestructive({
      title: 'Delete comment?',
      message: 'It is removed for everyone.',
      confirmLabel: 'Delete',
      onConfirm: () => deleteComment(id, commentId).catch(() => toast.error('Could not delete it.')),
    });
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.groupedBackground }]}
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Moment',
          ...(Platform.OS === 'web' && {
            headerLeft: () => (
              <WebBackButton
                label="Moments"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/moments' as Href))}
              />
            ),
          }),
        }}
      />
      {!moment ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={comments ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.header}>
              <MomentCard moment={moment} myUid={myUid} profiles={profiles} now={now} />
              <Text style={[styles.section, { color: theme.textSecondary }]}>
                {comments === null ? 'COMMENTS' : `COMMENTS · ${comments.length}`}
              </Text>
            </View>
          }
          ListEmptyComponent={
            comments === null ? (
              <ActivityIndicator />
            ) : (
              <Text style={[styles.empty, { color: theme.textSecondary }]}>No comments yet. Say something nice.</Text>
            )
          }
          renderItem={({ item }) => {
            const author = profiles[item.authorId];
            const canDelete = item.authorId === myUid || moment.authorId === myUid;
            return (
              <Pressable
                onLongPress={canDelete ? () => remove(item.id) : undefined}
                accessibilityHint={canDelete ? 'Long press to delete' : undefined}
                style={styles.comment}>
                <Avatar id={item.authorId} name={author?.name ?? '?'} size={32} uri={author?.avatarUrl} />
                <View style={[styles.bubble, { backgroundColor: theme.card }]}>
                  <Text style={[styles.commentName, { color: theme.text }]}>
                    {item.authorId === myUid ? 'You' : (author?.name ?? 'Someone')}
                    <Text style={[styles.commentTime, { color: theme.textSecondary }]}>
                      {'  '}
                      {timeAgo(item.createdAt?.toMillis(), now)}
                    </Text>
                  </Text>
                  <Text style={[styles.commentText, { color: theme.text }]}>{item.text}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <View
        style={[
          styles.composer,
          { backgroundColor: theme.background, borderTopColor: theme.separator, paddingBottom: Math.max(insets.bottom, 10) },
        ]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Add a comment…"
          placeholderTextColor={theme.textSecondary}
          maxLength={MAX_COMMENT_TEXT}
          multiline
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <Pressable
          onPress={send}
          disabled={!text.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Post comment"
          style={[styles.send, { backgroundColor: text.trim() ? theme.accent : theme.backgroundElement }]}>
          {sending ? <ActivityIndicator color="#fff" /> : <Icon name="arrow.up" size={18} color="#fff" fallback="↑" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: Spacing.five },
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  header: { gap: Spacing.three, marginBottom: Spacing.one },
  section: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
  empty: { fontSize: 15, textAlign: 'center', marginTop: Spacing.three },
  comment: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bubble: { flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  commentName: { fontSize: 14, fontWeight: '700' },
  commentTime: { fontSize: 12, fontWeight: '400' },
  commentText: { fontSize: 15, lineHeight: 20 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: Spacing.three,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
