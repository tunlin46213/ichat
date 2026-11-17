import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Message } from '@/lib/chat';

import { LinkifiedText } from './linkified-text';
import { AudioContent, ImageContent } from './media-content';

/** Unique emojis (in first-seen order) with a total count. */
function summarize(reactions: Record<string, string> | undefined) {
  const values = Object.values(reactions ?? {});
  return { emojis: [...new Set(values)].slice(0, 3), count: values.length };
}

export function MessageBubble({
  chatId,
  message,
  mine,
  tail,
  spaced,
  animate,
  myUid,
  otherName,
  onLongPress,
}: {
  chatId: string;
  message: Message;
  mine: boolean;
  /** last message of a run from the same sender: gets the squared "tail" corner */
  tail: boolean;
  /** first message of a run: extra space above it */
  spaced: boolean;
  /** pop in with a spring (new messages only, not the loaded history) */
  animate: boolean;
  myUid: string;
  otherName: string;
  onLongPress: (message: Message) => void;
}) {
  const theme = useTheme();
  const type = message.type ?? 'text';
  const { emojis, count } = summarize(message.reactions);
  const hasReactions = count > 0;
  const replyAuthor = message.replyTo
    ? message.replyTo.senderId === myUid
      ? 'You'
      : otherName
    : '';

  if (message.deleted) {
    return (
      <View style={[styles.row, mine ? styles.right : styles.left, { marginTop: spaced ? 8 : 2 }]}>
        <View style={[styles.bubble, styles.deleted, { borderColor: theme.separator }]}>
          <Text style={[styles.deletedText, { color: theme.textSecondary }]}>
            {mine ? 'You unsent a message' : `${otherName} unsent a message`}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Animated.View
      entering={animate ? FadeInDown.springify().damping(16) : undefined}
      style={[
        styles.row,
        mine ? styles.right : styles.left,
        {
          marginTop: spaced ? 8 : 2,
          marginBottom: hasReactions ? 14 : 0,
          opacity: message.pending ? 0.75 : 1,
        },
      ]}>
      <Pressable
        onLongPress={() => onLongPress(message)}
        delayLongPress={280}
        accessibilityHint="Long press for reactions, reply and more"
        style={styles.pressable}>
        {type === 'image' && message.mediaId ? (
          <ImageContent
            chatId={chatId}
            mediaId={message.mediaId}
            mime={message.mime ?? 'image/jpeg'}
            width={message.width}
            height={message.height}
            onLongPress={() => onLongPress(message)}
          />
        ) : (
          <View
            style={[
              styles.bubble,
              mine
                ? { backgroundColor: Accent, borderBottomRightRadius: tail ? 5 : 18 }
                : { backgroundColor: theme.bubbleIncoming, borderBottomLeftRadius: tail ? 5 : 18 },
            ]}>
            {message.replyTo ? (
              <View
                style={[
                  styles.quote,
                  {
                    backgroundColor: mine ? 'rgba(255,255,255,0.18)' : theme.backgroundSelected,
                    borderLeftColor: mine ? '#fff' : Accent,
                  },
                ]}>
                <Text
                  style={[styles.quoteAuthor, { color: mine ? '#fff' : Accent }]}
                  numberOfLines={1}>
                  {replyAuthor}
                </Text>
                <Text
                  style={[styles.quoteText, { color: mine ? 'rgba(255,255,255,0.85)' : theme.textSecondary }]}
                  numberOfLines={2}>
                  {message.replyTo.text || 'Message'}
                </Text>
              </View>
            ) : null}
            {type === 'audio' && message.mediaId ? (
              <AudioContent
                chatId={chatId}
                mediaId={message.mediaId}
                mime={message.mime ?? 'audio/mp4'}
                durationMs={message.durationMs}
                mine={mine}
              />
            ) : (
              <LinkifiedText
                text={message.text}
                linkColor={mine ? '#fff' : Accent}
                style={[styles.text, { color: mine ? '#fff' : theme.text }]}
              />
            )}
          </View>
        )}
        {message.editedAt ? (
          <Text style={[styles.edited, mine ? styles.editedMine : null, { color: theme.textSecondary }]}>
            Edited
          </Text>
        ) : null}

        {hasReactions ? (
          <View
            style={[
              styles.reactions,
              mine ? styles.reactionsMine : styles.reactionsTheirs,
              { backgroundColor: theme.card, borderColor: theme.background },
            ]}>
            <Text style={styles.reactionEmoji}>{emojis.join('')}</Text>
            {count > 1 ? (
              <Text style={[styles.reactionCount, { color: theme.textSecondary }]}>{count}</Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  pressable: { maxWidth: '78%' },
  bubble: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18 },
  text: { fontSize: 17, lineHeight: 22 },
  deleted: { borderWidth: 1, backgroundColor: 'transparent' },
  deletedText: { fontSize: 15, fontStyle: 'italic' },
  quote: {
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
    marginTop: 2,
  },
  quoteAuthor: { fontSize: 13, fontWeight: '600' },
  quoteText: { fontSize: 14, lineHeight: 18 },
  reactions: {
    position: 'absolute',
    bottom: -16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  reactionsMine: { left: -6 },
  reactionsTheirs: { right: -6 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 12, fontWeight: '600' },
  edited: { fontSize: 11, marginTop: 2, marginHorizontal: 6 },
  editedMine: { alignSelf: 'flex-end' },
});
