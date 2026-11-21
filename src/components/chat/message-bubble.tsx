import { useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
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

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { useAppearance } from '@/context/appearance';
import { useTheme } from '@/hooks/use-theme';
import { formatMessageTime, type Message } from '@/lib/chat';

import type { MenuAnchor } from './message-menu';
import { haptics } from '@/lib/haptics';

import { LinkPreview } from './link-preview';
import { firstUrl, LinkifiedText } from './linkified-text';
import { AudioContent, ImageContent } from './media-content';
import { CallContent, LocationContent, MomentShareContent } from './special-content';

/** How far to drag right before letting go starts a reply. */
const REPLY_AT = 56;

// The list is inverted (each cell is flipped vertically), so a negative translateY
// here means "from below" on screen.
const FLY = { damping: 16, stiffness: 210 };

/** My new message flies up out of the composer and settles into place. */
function SendEntering() {
  'worklet';
  return {
    initialValues: {
      opacity: 0,
      transform: [{ translateY: -80 }, { translateX: 24 }, { scale: 0.55 }],
    },
    animations: {
      opacity: withTiming(1, { duration: 120 }),
      transform: [
        { translateY: withSpring(0, FLY) },
        { translateX: withSpring(0, FLY) },
        { scale: withSpring(1, { damping: 12, stiffness: 230 }) },
      ],
    },
  };
}

/** A new incoming message pops in from the left. */
function ReceiveEntering() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateX: -28 }, { scale: 0.8 }] },
    animations: {
      opacity: withTiming(1, { duration: 160 }),
      transform: [
        { translateX: withSpring(0, FLY) },
        { scale: withSpring(1, { damping: 13, stiffness: 230 }) },
      ],
    },
  };
}

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
  read = false,
  delivered = false,
  avatar,
  scheduledFor = null,
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
  /** mine and the other person has read it (✓✓, bright) */
  read?: boolean;
  /** mine and it reached their app (✓✓, dim) */
  delivered?: boolean;
  /** "Tomorrow 9:00 AM" while my scheduled message waits to go out */
  scheduledFor?: string | null;
  /** their photo, shown beside the last bubble of each run of their messages */
  avatar?: { id: string; name: string; uri?: string | null };
  /** briefly outlined after jumping to it from search or the pinned bar */
  highlighted?: boolean;
  /** with where the bubble is on screen, so the menu can lift it in place */
  onLongPress: (message: Message, anchor?: MenuAnchor) => void;
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
  const { bubbleColor, textScale } = useAppearance();
  const type = message.type ?? 'text';
  const meta = (
    <BubbleMeta
      message={message}
      mine={mine}
      read={read}
      delivered={delivered}
      starred={!!starred}
      overlay={false}
      scheduledFor={scheduledFor}
    />
  );
  const { emojis, count } = summarize(message.reactions);
  const hasReactions = count > 0;
  const replyAuthor = message.replyTo
    ? message.replyTo.senderId === myUid
      ? 'You'
      : otherName
    : '';
  const link = type === 'text' && !message.deleted ? firstUrl(message.text) : null;

  // Long press: measure the bubble first so the menu opens right where it is.
  const bubbleRef = useRef<ComponentRef<typeof View>>(null);
  function longPress() {
    const node = bubbleRef.current;
    if (!node) return onLongPress(message);
    node.measureInWindow((x, y, width, height) => {
      onLongPress(message, width && height ? { x, y, width, height } : undefined);
    });
  }

  // ── Swipe right to reply, double tap to ❤️ ──
  const offset = useSharedValue(0);
  const passed = useRef(false);
  const pan = usePanGesture({
    runOnJS: true,
    enabled: !message.deleted && !message.pending && !message.failed,
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
    enabled: !message.deleted && !message.pending && !message.failed && type === 'text',
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
        {!mine && avatar ? <View style={styles.avatarSlot} /> : null}
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
        entering={
          !animate
            ? undefined
            : Platform.OS === 'web'
              ? // Reanimated's web layout animations only support the built-in presets.
                FadeInDown.springify().damping(16)
              : mine
                ? SendEntering
                : ReceiveEntering
        }
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

        {!mine && avatar ? (
          // Their photo next to the last bubble of each run, like iMessage group chats.
          <View style={styles.avatarSlot}>
            {tail ? <Avatar id={avatar.id} name={avatar.name} size={28} uri={avatar.uri} /> : null}
          </View>
        ) : null}

        <Animated.View style={[styles.pressable, mine ? styles.alignEnd : styles.alignStart, slide]}>
          {message.forwarded ? (
            <Text style={[styles.forwarded, { color: theme.textSecondary }]}>↪︎ Forwarded</Text>
          ) : null}
          <Pressable
            ref={bubbleRef}
            onLongPress={longPress}
            // Not delivered: a tap opens Try Again / Delete (the same as a long press).
            onPress={message.failed ? longPress : undefined}
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
                thumb={message.thumb}
                onLongPress={longPress}
                onOpen={() => onOpenImage(message)}
              />
            ) : type === 'location' ? (
              <LocationContent message={message} mine={mine} onLongPress={longPress} />
            ) : message.moment && !message.deleted ? (
              <MomentShareContent message={message} mine={mine} onLongPress={longPress} />
            ) : (
              <View
                style={[
                  styles.bubble,
                  { backgroundColor: mine ? bubbleColor : theme.bubbleIncoming },
                  // Waiting to be sent: faded with a dashed outline.
                  scheduledFor ? styles.scheduled : null,
                  message.failed ? styles.failed : null,
                ]}>
                {tail ? <BubbleTail side={mine ? 'right' : 'left'} color={mine ? bubbleColor : theme.bubbleIncoming} /> : null}
                {message.replyTo ? (
                  <View
                    style={[
                      styles.quote,
                      {
                        backgroundColor: mine ? 'rgba(255,255,255,0.18)' : theme.backgroundSelected,
                        borderLeftColor: mine ? '#fff' : theme.accent,
                      },
                    ]}>
                    <Text
                      style={[styles.quoteAuthor, { color: mine ? '#fff' : theme.accent, fontSize: 13 * textScale }]}
                      numberOfLines={1}>
                      {replyAuthor}
                    </Text>
                    <Text
                      style={[
                        styles.quoteText,
                        {
                          color: mine ? 'rgba(255,255,255,0.85)' : theme.textSecondary,
                          fontSize: 14 * textScale,
                          lineHeight: 18 * textScale,
                        },
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
                    {/* Time + ticks sit after the last line, wrapping below when it's full. */}
                    <View style={styles.textRow}>
                      <LinkifiedText
                        text={message.text}
                        linkColor={mine ? '#fff' : theme.accent}
                        style={[
                          styles.text,
                          { color: mine ? '#fff' : theme.text, fontSize: 17 * textScale, lineHeight: 22 * textScale },
                        ]}
                      />
                      {meta}
                    </View>
                    {link ? <LinkPreview url={link} mine={mine} /> : null}
                  </>
                )}
                {type === 'audio' || type === 'call' ? <View style={styles.metaEnd}>{meta}</View> : null}
              </View>
            )}
            {type === 'image' || type === 'location' || (message.moment && !message.deleted) ? (
              // Live location bubbles have a Stop button at the bottom: time goes on the map.
              <View style={message.liveUntil ? styles.overlayMetaTop : styles.overlayMeta} pointerEvents="none">
                <BubbleMeta message={message} mine={mine} read={read} delivered={delivered} starred={!!starred} overlay />
              </View>
            ) : null}
          </Pressable>

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

// iMessage-style tail paths (from a 15.5 × 17.5 box), drawn in the bubble's color.
const TAIL_RIGHT = 'M48,35c-7-4-6-8.75-6-17.5C28,17.5,29,35,48,35z';
const TAIL_LEFT = 'M32.484,35c7-4,6-8.75,6-17.5C52.484,17.5,51.484,35,32.484,35z';

function BubbleTail({ side, color }: { side: 'left' | 'right'; color: string }) {
  return (
    <Svg
      width={15.5}
      height={17.5}
      viewBox="32.484 17.5 15.515 17.5"
      pointerEvents="none"
      style={side === 'right' ? styles.tailRight : styles.tailLeft}>
      <Path d={side === 'right' ? TAIL_RIGHT : TAIL_LEFT} fill={color} />
    </Svg>
  );
}

/**
 * "edited ★ 3:05 PM ✓✓" inside the bubble. Mine: a clock while sending, ✓ once on the
 * server, ✓✓ once they've read it. `overlay` = on top of a photo / map.
 */
function BubbleMeta({ message, mine, read, delivered = false, starred, overlay, scheduledFor = null }: {
  message: Message;
  mine: boolean;
  read: boolean;
  delivered?: boolean;
  starred: boolean;
  overlay: boolean;
  scheduledFor?: string | null;
}) {
  const theme = useTheme();
  const color = overlay ? '#fff' : mine ? 'rgba(255,255,255,0.78)' : theme.textSecondary;
  const tickColor = overlay || mine ? (read ? '#fff' : 'rgba(255,255,255,0.7)') : theme.textSecondary;
  const label = [message.editedAt ? 'edited' : null, formatMessageTime(message.createdAt)]
    .filter(Boolean)
    .join(' ');
  const status = message.pending ? 'Sending' : read ? 'Read' : delivered ? 'Delivered' : 'Sent';
  if (message.failed) {
    return (
      <View style={styles.meta} accessible accessibilityLabel="Not delivered. Tap to try again">
        <Icon name="exclamationmark.circle.fill" size={11} color="#fff" fallback="!" />
        <Text style={[styles.metaText, styles.failedText]}>Not delivered · tap to retry</Text>
      </View>
    );
  }
  if (scheduledFor) {
    return (
      <View style={styles.meta} accessible accessibilityLabel={`Scheduled for ${scheduledFor}`}>
        <Icon name="clock" size={10} color={color} fallback="🕓" />
        <Text style={[styles.metaText, { color }]}>Scheduled · {scheduledFor}</Text>
      </View>
    );
  }
  return (
    <View
      style={[styles.meta, overlay && styles.metaPill]}
      accessible
      accessibilityLabel={`${label}${mine ? `, ${status}` : ''}${starred ? ', starred' : ''}`}>
      {starred ? <Text style={[styles.metaText, { color }]}>★</Text> : null}
      <Text style={[styles.metaText, { color }]}>{label}</Text>
      {mine ? (
        message.pending ? (
          <Icon name="clock" size={10} color={tickColor} fallback="🕓" />
        ) : (
          <View style={styles.ticks}>
            <Icon name="checkmark" size={10} color={tickColor} fallback="✓" />
            {read || delivered ? (
              <View style={styles.secondTick}>
                <Icon name="checkmark" size={10} color={tickColor} fallback="✓" />
              </View>
            ) : null}
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scheduled: { opacity: 0.7, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.8)' },
  failed: { opacity: 0.85, borderWidth: 1.5, borderColor: '#FF3B30' },
  failedText: { color: '#fff', fontWeight: '600' },
  tailRight: { position: 'absolute', right: -5, bottom: 0 },
  tailLeft: { position: 'absolute', left: -5, bottom: 0 },
  avatarSlot: { width: 28, marginRight: 6, alignSelf: 'flex-end' },
  textRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'flex-end' },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 8,
    marginBottom: -1,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  metaEnd: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 },
  metaPill: {
    flexGrow: 0,
    marginLeft: 0,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  overlayMeta: { position: 'absolute', right: 8, bottom: 8 },
  overlayMetaTop: { position: 'absolute', right: 8, top: 8 },
  metaText: { fontSize: 11, fontWeight: '500', fontVariant: ['tabular-nums'] },
  ticks: { flexDirection: 'row', alignItems: 'center' },
  secondTick: { marginLeft: -6 },
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
});
