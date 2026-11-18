import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Spacing } from '@/constants/theme';
import { useAppearance } from '@/context/appearance';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { formatSeparator, previewFor, REACTIONS, type Message } from '@/lib/chat';

import { useMediaUri } from './media-content';

/** Where the pressed bubble is on screen (window coordinates). */
export type MenuAnchor = { x: number; y: number; width: number; height: number };

const REACTION_BAR_H = 54;
const GAP = 8;
const EDGE = 10;

type Action = { label: string; icon: IconName; destructive?: boolean; onPress: () => void };

type MenuProps = Parameters<typeof MessageMenuBody>[0];

/**
 * iOS-style context menu for a message: the chat blurs, the message lifts out right
 * where it was, with the reaction bar above and actions below. Tap outside to close.
 */
export function MessageMenu(props: Omit<MenuProps, 'message'> & { message: Message | null }) {
  if (!props.message) return null;
  // Keyed so each opening measures and animates afresh.
  return <MessageMenuBody key={props.message.id} {...props} message={props.message} />;
}

function MessageMenuBody({
  chatId,
  message,
  anchor,
  mine,
  myReaction,
  onClose,
  onReact,
  onReply,
  onCopy,
  onUnsend,
  onEdit,
  onReport,
  pinned,
  onPin,
  starred,
  onStar,
  onForward,
}: {
  chatId: string;
  message: Message;
  /** where the bubble was; without it the menu is centered */
  anchor?: MenuAnchor | null;
  mine: boolean;
  myReaction: string | undefined;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onUnsend: () => void;
  /** shown for my recent text messages */
  onEdit?: () => void;
  /** shown for the other person's messages */
  onReport?: () => void;
  /** this message is the chat's pinned one */
  pinned: boolean;
  onPin: () => void;
  starred: boolean;
  onStar: () => void;
  /** missing for messages that can't be forwarded (call log) */
  onForward?: () => void;
}) {
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { bubbleColor } = useAppearance();
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [columnH, setColumnH] = useState<number | null>(null);
  const appear = useSharedValue(0);

  // Start with the bubble at its own spot; push the whole menu up or down only as
  // much as needed to keep it on screen.
  const minTop = insets.top + EDGE;
  const desired = anchor ? anchor.y - REACTION_BAR_H - GAP : (H - (columnH ?? 0)) / 2;
  const top =
    columnH === null ? Math.max(minTop, desired) : Math.max(minTop, Math.min(desired, H - insets.bottom - EDGE - columnH));
  const side = anchor
    ? mine
      ? { right: Math.max(EDGE, W - (anchor.x + anchor.width)) }
      : { left: Math.max(EDGE, anchor.x) }
    : mine
      ? { right: 16 }
      : { left: 16 };

  const columnStyle = useAnimatedStyle(() => ({
    opacity: appear.get(),
    transform: [{ scale: 0.92 + 0.08 * appear.get() }],
  }));
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.04 * appear.get() }] }));
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - appear.get()) * 14 }] }));

  const type = message.type ?? 'text';
  const actions: Action[] = [{ label: 'Reply', icon: 'arrowshape.turn.up.left', onPress: onReply }];
  if (onForward) {
    actions.push({ label: 'Forward', icon: 'arrowshape.turn.up.right', onPress: onForward });
  }
  if (type === 'text') actions.push({ label: 'Copy', icon: 'doc.on.doc', onPress: onCopy });
  actions.push({ label: pinned ? 'Unpin' : 'Pin', icon: pinned ? 'pin.slash' : 'pin', onPress: onPin });
  actions.push({ label: starred ? 'Unstar' : 'Star', icon: starred ? 'star.slash' : 'star', onPress: onStar });
  if (onEdit) actions.push({ label: 'Edit', icon: 'pencil', onPress: onEdit });
  if (onReport) {
    actions.push({
      label: 'Report',
      icon: 'exclamationmark.bubble.fill',
      destructive: true,
      onPress: onReport,
    });
  }
  if (mine) {
    actions.push({
      label: 'Unsend',
      icon: 'arrow.uturn.backward.circle',
      destructive: true,
      onPress: onUnsend,
    });
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(180)} style={StyleSheet.absoluteFill}>
        <BlurView
          intensity={scheme === 'dark' ? 45 : 35}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.18)' }]}
          onPress={onClose}
          accessibilityLabel="Close menu"
        />
      </Animated.View>

      <Animated.View
        onLayout={(e) => {
          if (columnH !== null) return;
          setColumnH(e.nativeEvent.layout.height);
          appear.set(withSpring(1, { damping: 16, stiffness: 260 }));
        }}
        style={[
          styles.column,
          { top, maxWidth: W - EDGE * 2 },
          side,
          mine ? styles.alignEnd : styles.alignStart,
          columnStyle,
        ]}>
        <Animated.View style={[styles.reactionBar, { backgroundColor: theme.card }, barStyle]}>
          {REACTIONS.map((emoji) => {
            const selected = myReaction === emoji;
            return (
              <Pressable
                key={emoji}
                onPress={() => onReact(emoji)}
                accessibilityRole="button"
                accessibilityLabel={`React ${emoji}`}
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.reaction,
                  selected && { backgroundColor: bubbleColor },
                  pressed && { transform: [{ scale: 1.25 }] },
                ]}>
                <Text style={styles.reactionText}>{emoji}</Text>
              </Pressable>
            );
          })}
        </Animated.View>

        <Animated.View style={liftStyle}>
          <LiftedBubble chatId={chatId} message={message} mine={mine} anchor={anchor} bubbleColor={bubbleColor} />
        </Animated.View>
        <Text style={[styles.timestamp, { color: scheme === 'dark' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.6)' }]}>
          {formatSeparator(message.createdAt)}
        </Text>

        <View style={[styles.actions, { backgroundColor: theme.card }]}>
          {actions.map((action, i) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.action,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator },
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}>
              <Text style={[styles.actionText, { color: action.destructive ? '#FF3B30' : theme.text }]}>
                {action.label}
              </Text>
              <Icon
                name={action.icon}
                size={19}
                color={action.destructive ? '#FF3B30' : theme.text}
                fallback=""
              />
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
}

/** Copy of the pressed message, drawn at the same size so it looks lifted off the chat. */
function LiftedBubble({ chatId, message, mine, anchor, bubbleColor }: {
  chatId: string;
  message: Message;
  mine: boolean;
  anchor?: MenuAnchor | null;
  bubbleColor: string;
}) {
  const theme = useTheme();
  const type = message.type ?? 'text';
  if (type === 'image' && message.mediaId) {
    return <LiftedPhoto chatId={chatId} message={message} anchor={anchor} />;
  }
  return (
    <View
      style={[
        styles.preview,
        anchor && { width: anchor.width },
        mine
          ? { backgroundColor: bubbleColor, borderBottomRightRadius: 5 }
          : { backgroundColor: theme.bubbleIncoming, borderBottomLeftRadius: 5 },
      ]}>
      <Text style={[styles.previewText, { color: mine ? '#fff' : theme.text }]} numberOfLines={10}>
        {type === 'text' ? message.text : previewFor(message)}
      </Text>
    </View>
  );
}

function LiftedPhoto({ chatId, message, anchor }: {
  chatId: string;
  message: Message;
  anchor?: MenuAnchor | null;
}) {
  const theme = useTheme();
  const { uri } = useMediaUri(chatId, message.mediaId ?? '', message.mime ?? 'image/jpeg');
  const width = Math.min(anchor?.width ?? 200, 240);
  const height = Math.min(anchor?.height ?? 200, 280);
  return (
    <View style={[styles.photo, { width, height, backgroundColor: theme.backgroundElement }]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  alignEnd: { alignItems: 'flex-end' },
  alignStart: { alignItems: 'flex-start' },
  column: { position: 'absolute', gap: GAP },
  reactionBar: {
    flexDirection: 'row',
    gap: 2,
    padding: 6,
    borderRadius: 28,
    boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
  },
  reaction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionText: { fontSize: 26 },
  preview: {
    maxWidth: 320,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 18,
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
  },
  photo: { borderRadius: 16, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' },
  previewText: { fontSize: 17, lineHeight: 22 },
  timestamp: { fontSize: 12, fontWeight: '500', marginHorizontal: 6 },
  actions: {
    width: 250,
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    minHeight: 46,
  },
  actionText: { fontSize: 17 },
});
