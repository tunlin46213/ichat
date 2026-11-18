import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  FadeInDown,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Accent } from '@/constants/theme';
import { useAppearance } from '@/context/appearance';
import { useTheme } from '@/hooks/use-theme';
import type { Message } from '@/lib/chat';
import { haptics } from '@/lib/haptics';

import { LinkPreview } from './link-preview';
import { firstUrl, LinkifiedText } from './linkified-text';
import { AudioContent, ImageContent } from './media-content';
import { CallContent, LocationContent } from './special-content';

/** How far to drag right before letting go starts a reply. */
const REPLY_AT = 56;

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
  starred,
  highlighted,
  onLongPress,
  onReply,
  onDoubleTap,
  onCallBack,
  onOpenImage,
  onShowReactions,
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
  /** I starred it (shows a small ★) */
  starred?: boolean;
  /** briefly outlined after jumping to it from search or the pinned bar */
  highlighted?: boolean;
  onLongPress: (message: Message) => void;
  /** swipe right */
  onReply: (message: Message) => void;
  /** double tap (❤️) */
  onDoubleTap: (message: Message) => void;
  /** tap on a call log entry */
  onCallBack: (video: boolean) => void;
  /** tap on a photo */
  onOpenImage: (message: Message) => void;
  /** tap on the reactions pill: who reacted with what */
  onShowReactions: (message: Message) => void;
}) {
  const theme = useTheme();
  const { bubbleColor } = useAppearance();
  const type = message.type ?? 'text';
  const { emojis, count } = summarize(message.reactions);
  const hasReactions = count > 0;
  const replyAuthor = message.replyTo
    ? message.replyTo.senderId === myUid
      ? 'You'
      : otherName
    : '';
  const link = type === 'text' && !message.deleted ? firstUrl(message.text) : null;

  // ── Swipe right to reply, double tap to ❤️ ──
  const offset = useSharedValue(0);
  const passed = useRef(false);
  const pan = usePanGesture({
    runOnJS: true,
    enabled: !message.deleted && !message.pending,
    // Only a rightward drag starts it; vertical movement leaves it to the list scroll.
    activeOffsetX: 14,
    failOffsetY: [-12, 12],
    onActivate: () => {
      passed.current = false;
    },
    onUpdate: (e) => {
      const x = Math.max(0, e.translationX);
      // Rubber band after the reply point.
      offset.set(x < REPLY_AT ? x : REPLY_AT + (x - REPLY_AT) * 0.25);
      if (!passed.current && x >= REPLY_AT) {
        passed.current = true;
        haptics.light();
      }
    },
    onDeactivate: (e) => {
      if (!e.canceled && e.translationX >= REPLY_AT) onReply(message);
    },
    onFinalize: () => {
      offset.set(withSpring(0, { damping: 18, stiffness: 220 }));
    },
  });
  // Big heart that pops over the bubble on double tap.
  const heart = useSharedValue(0);
  const [burst, setBurst] = useState(0);
  const doubleTap = useTapGesture({
    runOnJS: true,
    numberOfTaps: 2,
    // Text only: photos, voice notes, locations and call entries act on the first tap
    // (open, play, open Maps, call back), so a double tap would trigger that too.
    enabled: !message.deleted && !message.pending && type === 'text',
    onActivate: () => {
      // Only celebrate adding a ❤️, not removing it.
      if (message.reactions?.[myUid] !== '❤️') {
        setBurst((b) => b + 1);
        heart.set(
          withSequence(
            withSpring(1, { damping: 7, stiffness: 260 }),
            withDelay(350, withTiming(0, { duration: 220 }))
          )
        );
      }
      onDoubleTap(message);
    },
  });
  const heartStyle = useAnimatedStyle(() => ({
    opacity: heart.get() > 0.02 ? 1 : 0,
    transform: [{ scale: 0.3 + heart.get() * 0.9 }, { rotate: `${(1 - heart.get()) * -18}deg` }],
  }));
  const gesture = useSimultaneousGestures(pan, doubleTap);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  const replyIcon = useAnimatedStyle(() => ({
    opacity: interpolate(offset.get(), [10, REPLY_AT], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(offset.get(), [10, REPLY_AT], [0.5, 1], 'clamp') }],
  }));

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
    <GestureDetector gesture={gesture}>
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
        <Animated.View style={[styles.replyIcon, replyIcon]} pointerEvents="none">
          <Icon name="arrowshape.turn.up.left" size={16} color={theme.textSecondary} fallback="↩" />
        </Animated.View>

        <Animated.View style={[styles.pressable, mine ? styles.alignEnd : styles.alignStart, slide]}>
          {message.forwarded ? (
            <Text style={[styles.forwarded, { color: theme.textSecondary }]}>↪︎ Forwarded</Text>
          ) : null}
          <Pressable
            onLongPress={() => onLongPress(message)}
            delayLongPress={280}
            accessibilityHint="Long press for reactions and more. Swipe right to reply. Double tap to like."
            style={[
              highlighted && [styles.highlight, { borderColor: bubbleColor }],
            ]}>
            {type === 'image' && message.mediaId ? (
              <ImageContent
                chatId={chatId}
                mediaId={message.mediaId}
                mime={message.mime ?? 'image/jpeg'}
                width={message.width}
                height={message.height}
                onLongPress={() => onLongPress(message)}
                onOpen={() => onOpenImage(message)}
              />
            ) : type === 'location' ? (
              <LocationContent message={message} mine={mine} />
            ) : (
              <View
                style={[
                  styles.bubble,
                  mine
                    ? { backgroundColor: bubbleColor, borderBottomRightRadius: tail ? 5 : 18 }
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
                      style={[
                        styles.quoteText,
                        { color: mine ? 'rgba(255,255,255,0.85)' : theme.textSecondary },
                      ]}
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
                    waveform={message.waveform}
                    mine={mine}
                  />
                ) : type === 'call' ? (
                  <CallContent message={message} mine={mine} onCallBack={onCallBack} />
                ) : (
                  <>
                    <LinkifiedText
                      text={message.text}
                      linkColor={mine ? '#fff' : Accent}
                      style={[styles.text, { color: mine ? '#fff' : theme.text }]}
                    />
                    {link ? <LinkPreview url={link} mine={mine} /> : null}
                  </>
                )}
              </View>
            )}
          </Pressable>

          {message.editedAt || starred ? (
            <Text style={[styles.meta, { color: theme.textSecondary }]}>
              {[starred ? '★' : null, message.editedAt ? 'Edited' : null].filter(Boolean).join(' · ')}
            </Text>
          ) : null}

          {hasReactions ? (
            // Keyed by the emojis so the pill pops whenever a reaction changes.
            <Animated.View
              key={`${emojis.join('')}${count}`}
              entering={ZoomIn.springify().damping(12)}
              style={[styles.reactions, mine ? styles.reactionsMine : styles.reactionsTheirs]}>
              <Pressable
                onPress={() => onShowReactions(message)}
                accessibilityRole="button"
                accessibilityLabel="See reactions"
                hitSlop={6}
                style={[styles.reactionPill, { backgroundColor: theme.card, borderColor: theme.background }]}>
                <Text style={styles.reactionEmoji}>{emojis.join('')}</Text>
                {count > 1 ? (
                  <Text style={[styles.reactionCount, { color: theme.textSecondary }]}>{count}</Text>
                ) : null}
              </Pressable>
            </Animated.View>
          ) : null}

          {burst > 0 ? (
            <Animated.View pointerEvents="none" style={[styles.burst, heartStyle]} exiting={FadeOut}>
              <Text style={styles.burstHeart}>❤️</Text>
            </Animated.View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  pressable: { maxWidth: '78%' },
  alignEnd: { alignItems: 'flex-end' },
  alignStart: { alignItems: 'flex-start' },
  replyIcon: {
    position: 'absolute',
    left: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(127,127,127,0.18)',
  },
  bubble: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18 },
  highlight: { borderWidth: 2, borderRadius: 20, padding: 1 },
  text: { fontSize: 17, lineHeight: 22 },
  forwarded: { fontSize: 12, fontStyle: 'italic', marginBottom: 2, marginHorizontal: 8 },
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
  reactions: { position: 'absolute', bottom: -16 },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  burst: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstHeart: { fontSize: 54, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 8 },
  reactionsMine: { left: -6 },
  reactionsTheirs: { right: -6 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 12, fontWeight: '600' },
  meta: { fontSize: 11, marginTop: 2, marginHorizontal: 6 },
});
