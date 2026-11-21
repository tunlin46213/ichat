import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { HeartBurst, MomentCard, openProfile, timeAgo, useDoubleTap } from '@/components/moments/moment-card';
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
import {
  addComment,
  deleteComment,
  MAX_COMMENT_TEXT,
  toggleCommentLike,
  wasDeletedHere,
  useComments,
  useMoment,
  type CommentReplyTo,
  type MomentComment,
} from '@/lib/moments';
import type { UserProfile } from '@/lib/chat';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';

/** One moment with all its comments, and a field to add one. */
export default function MomentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user } = useAuth();
  const myUid = user!.uid;
  const moment = useMoment(id);
  const { blocked } = useBlocks();
  const allComments = useComments(id);
  const comments = allComments?.filter((c) => !blocked.includes(c.authorId)) ?? null;
  const threaded = threadComments(comments ?? []);
  const now = useNow(60_000);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<CommentReplyTo | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const profiles = useUserProfiles([
    myUid,
    ...(moment ? [moment.authorId, ...Object.keys(moment.likes ?? {})] : []),
    ...(comments ?? []).map((c) => c.authorId),
  ]);

  // Deleted while open (or a dead link from an alert): leave.
  useEffect(() => {
    if (moment !== null) return;
    if (id && !wasDeletedHere(id)) toast.info('This moment is no longer available.');
    if (router.canGoBack()) router.back();
    else router.replace('/moments' as Href);
  }, [moment, id]);

  async function send() {
    const clean = text.trim();
    if (!clean || sending || !moment) return;
    setSending(true);
    try {
      // Only names still in the text count (the person may have deleted the @Name).
      const mentioned = picked.filter((m) => clean.includes(`@${m.handle}`)).map((m) => m.uid);
      await addComment(moment.id, myUid, clean, replyTo ?? undefined, mentioned);
      setText('');
      setReplyTo(null);
      setPicked([]);
      haptics.light();
    } catch {
      toast.error('Could not post the comment. Try again.');
    } finally {
      setSending(false);
    }
  }

  // @mention: "@" + letters at the end of the text shows matching people above the field.
  const people = useAllUsers(myUid).filter((u) => !blocked.includes(u.id));
  const [picked, setPicked] = useState<{ uid: string; handle: string }[]>([]);
  const typing = /(?:^|\s)@([^\s@]*)$/.exec(text);
  const suggestions = typing
    ? people.filter((u) => u.name.toLowerCase().includes(typing[1].toLowerCase())).slice(0, 5)
    : [];

  function mention(person: UserProfile) {
    const handle = person.name.split(' ')[0];
    setText((t) => t.replace(/@([^\s@]*)$/, `@${handle} `));
    setPicked((list) => [...list.filter((m) => m.uid !== person.id), { uid: person.id, handle }]);
    haptics.light();
    input.current?.focus();
  }

  function reply(commentId: string, authorId: string) {
    setReplyTo({ id: commentId, authorId, name: profiles[authorId]?.name ?? 'Someone' });
    haptics.light();
    input.current?.focus();
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
      // The real header height (≈ 100 on notched iPhones): a fixed 64 left the field under the keyboard.
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
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
          data={threaded}
          keyExtractor={(c) => c.comment.id}
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
          renderItem={({ item }) => (
            <CommentRow
              comment={item.comment}
              depth={item.depth}
              momentId={moment.id}
              myUid={myUid}
              profiles={profiles}
              now={now}
              canDelete={item.comment.authorId === myUid || moment.authorId === myUid}
              onReply={() => reply(item.comment.id, item.comment.authorId)}
              onDelete={() => remove(item.comment.id)}
            />
          )}
        />
      )}
      {suggestions.length ? (
        <View style={[styles.mentions, { backgroundColor: theme.background, borderTopColor: theme.separator }]}>
          {suggestions.map((u) => (
            <Pressable
              key={u.id}
              onPress={() => mention(u)}
              accessibilityRole="button"
              accessibilityLabel={`Mention ${u.name}`}
              style={({ pressed }) => [styles.mentionRow, pressed && { backgroundColor: theme.backgroundSelected }]}>
              <Avatar id={u.id} name={u.name} size={30} uri={u.avatarUrl} />
              <Text style={[styles.mentionName, { color: theme.text }]} numberOfLines={1}>
                {u.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {replyTo ? (
        <View style={[styles.replyBar, { backgroundColor: theme.background, borderTopColor: theme.separator }]}>
          <Text style={[styles.replyBarText, { color: theme.textSecondary }]} numberOfLines={1}>
            Replying to{' '}
            <Text style={{ color: theme.text, fontWeight: '600' }}>
              {replyTo.authorId === myUid ? 'yourself' : replyTo.name}
            </Text>
          </Text>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel reply">
            <Icon name="xmark.circle.fill" size={18} color={theme.textSecondary} fallback="✕" />
          </Pressable>
        </View>
      ) : null}
      <View
        style={[
          styles.composer,
          {
            backgroundColor: theme.background,
            borderTopColor: theme.separator,
            borderTopWidth: replyTo ? 0 : StyleSheet.hairlineWidth,
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}>
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          placeholder={replyTo && replyTo.authorId !== myUid ? `Reply to ${replyTo.name}…` : 'Add a comment…'}
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

/** Everyone on iChat except me (for @mentions). */
function useAllUsers(myUid: string) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'users'), orderBy('nameLower')),
        (snap) => setUsers(snap.docs.filter((d) => d.id !== myUid).map((d) => ({ id: d.id, ...d.data() }) as UserProfile)),
        () => {}
      ),
    [myUid]
  );
  return users;
}

/** Comment text with @names picked out. */
function MentionText({ text, style, color, onMention }: {
  text: string;
  style: StyleProp<TextStyle>;
  color: string;
  onMention?: (handle: string) => void;
}) {
  const parts = text.split(/(@[^\s@]+)/);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ color, fontWeight: '600' }} onPress={onMention ? () => onMention(part.slice(1)) : undefined}>
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}

/**
 * Replies sit under the comment they answer (one level, like most apps): a reply to a
 * reply joins the same thread. A reply whose comment was deleted stands on its own.
 */
function threadComments(comments: MomentComment[]) {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (c: MomentComment) => {
    let current = c;
    for (let i = 0; i < 20 && current.replyTo && byId.has(current.replyTo.id); i++) current = byId.get(current.replyTo.id)!;
    return current.id;
  };
  const children = new Map<string, MomentComment[]>();
  const roots: MomentComment[] = [];
  for (const c of comments) {
    const root = rootOf(c);
    if (root === c.id) roots.push(c);
    else children.set(root, [...(children.get(root) ?? []), c]);
  }
  return roots.flatMap((r) => [
    { comment: r, depth: 0 },
    ...(children.get(r.id) ?? []).map((c) => ({ comment: c, depth: 1 })),
  ]);
}

function CommentRow({ comment, depth, momentId, myUid, profiles, now, canDelete, onReply, onDelete }: {
  comment: MomentComment;
  depth: number;
  momentId: string;
  myUid: string;
  profiles: Record<string, UserProfile>;
  now: number;
  canDelete: boolean;
  onReply: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const [burst, setBurst] = useState(0);
  const author = profiles[comment.authorId];
  const likes = Object.keys(comment.likes ?? {}).length;
  const liked = !!comment.likes?.[myUid];

  function like(onlyAdd: boolean) {
    if (onlyAdd && liked) return;
    haptics.light();
    toggleCommentLike(momentId, comment, myUid).catch(() => toast.error('Could not like it. Check your connection.'));
  }
  const press = useDoubleTap(undefined, () => {
    setBurst((n) => n + 1);
    like(true);
  });
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(0), 700);
    return () => clearTimeout(t);
  }, [burst]);

  const size = depth ? 26 : 34;
  return (
    <View style={[styles.comment, depth ? styles.reply : null]}>
      <Pressable
        onPress={() => openProfile(comment.authorId, author?.name)}
        accessibilityRole="button"
        accessibilityLabel={`${author?.name ?? 'Someone'}, view profile`}>
        <Avatar id={comment.authorId} name={author?.name ?? '?'} size={size} uri={author?.avatarUrl} />
      </Pressable>
      <View style={styles.commentBody}>
        <Pressable
          onPress={press}
          onLongPress={canDelete ? onDelete : undefined}
          accessibilityHint={canDelete ? 'Double tap to like, long press to delete' : 'Double tap to like'}
          style={[styles.bubble, { backgroundColor: theme.card }]}>
          <Text
            onPress={() => openProfile(comment.authorId, author?.name)}
            style={[styles.commentName, { color: theme.text }]}>
            {comment.authorId === myUid ? 'You' : (author?.name ?? 'Someone')}
          </Text>
          {comment.replyTo && depth ? (
            <Text style={[styles.replyLabel, { color: theme.accent }]} numberOfLines={1}>
              @{comment.replyTo.authorId === myUid ? 'You' : (profiles[comment.replyTo.authorId]?.name ?? comment.replyTo.name)}
            </Text>
          ) : comment.replyTo ? (
            <Text style={[styles.replyLabel, { color: theme.accent }]} numberOfLines={1}>
              ↪ {comment.replyTo.authorId === myUid ? 'You' : (profiles[comment.replyTo.authorId]?.name ?? comment.replyTo.name)}
            </Text>
          ) : null}
          <MentionText
            text={comment.text}
            style={[styles.commentText, { color: theme.text }]}
            color={theme.accent}
            // "@Bae" → the mentioned person whose first name it is.
            onMention={(handle) => {
              const uid = (comment.mentions ?? []).find(
                (u) => profiles[u]?.name?.split(' ')[0]?.toLowerCase() === handle.toLowerCase()
              );
              if (uid) openProfile(uid, profiles[uid]?.name);
            }}
          />
          {likes ? (
            <View style={[styles.likeBadge, { backgroundColor: theme.background, borderColor: theme.separator }]}>
              <Icon name="heart.fill" size={10} color="#FF3B30" fallback="❤️" />
              {likes > 1 ? <Text style={[styles.likeBadgeText, { color: theme.textSecondary }]}>{likes}</Text> : null}
            </View>
          ) : null}
          {burst ? <HeartBurst key={burst} size={40} /> : null}
        </Pressable>
        <View style={styles.commentMeta}>
          <Text style={[styles.commentTime, { color: theme.textSecondary }]}>{timeAgo(comment.createdAt?.toMillis(), now)}</Text>
          <Pressable onPress={() => like(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike comment' : 'Like comment'}>
            <Text style={[styles.replyButton, { color: liked ? '#FF3B30' : theme.textSecondary }]}>{liked ? 'Liked' : 'Like'}</Text>
          </Pressable>
          <Pressable onPress={onReply} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Reply to ${author?.name ?? 'comment'}`}>
            <Text style={[styles.replyButton, { color: theme.textSecondary }]}>Reply</Text>
          </Pressable>
        </View>
      </View>
    </View>
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
  reply: { marginLeft: 42 },
  likeBadge: {
    position: 'absolute',
    right: -6,
    bottom: -8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 5,
    height: 20,
  },
  likeBadgeText: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  commentBody: { flex: 1, gap: 3 },
  mentions: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.three, paddingVertical: 7 },
  mentionName: { flex: 1, fontSize: 15, fontWeight: '600' },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  commentMeta: { flexDirection: 'row', gap: 14, paddingLeft: 12 },
  replyButton: { fontSize: 12, fontWeight: '700' },
  replyLabel: { fontSize: 13, fontWeight: '600' },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  replyBarText: { flex: 1, fontSize: 13 },
  commentName: { fontSize: 14, fontWeight: '700' },
  commentTime: { fontSize: 12 },
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
