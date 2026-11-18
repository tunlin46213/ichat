import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { Spacing } from '@/constants/theme';
import { useAppearance } from '@/context/appearance';
import { useTheme } from '@/hooks/use-theme';
import { formatSeparator, previewFor, REACTIONS, type Message } from '@/lib/chat';

type Action = { label: string; icon: IconName; destructive?: boolean; onPress: () => void };

/**
 * iOS-style context menu for a message: reaction bar on top, the message itself,
 * then actions. Tapping outside closes it.
 */
export function MessageMenu({
  message,
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
  message: Message | null;
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
  const { bubbleColor } = useAppearance();
  if (!message) return null;

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
      <Animated.View entering={FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={onClose}
          accessibilityLabel="Close menu"
        />
      </Animated.View>

      <View style={[styles.center, mine ? styles.alignEnd : styles.alignStart]} pointerEvents="box-none">
        <Animated.View
          entering={ZoomIn.springify().damping(18)}
          style={[styles.column, mine ? styles.alignEnd : styles.alignStart]}>
          <View style={[styles.reactionBar, { backgroundColor: theme.card }]}>
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
          </View>

          <View
            style={[
              styles.preview,
              { backgroundColor: mine ? bubbleColor : theme.bubbleIncoming },
            ]}>
            <Text style={[styles.previewText, { color: mine ? '#fff' : theme.text }]} numberOfLines={8}>
              {previewFor(message)}
            </Text>
          </View>
          <Text style={styles.timestamp}>{formatSeparator(message.createdAt)}</Text>

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
                <Text
                  style={[
                    styles.actionText,
                    { color: action.destructive ? '#FF3B30' : theme.text },
                  ]}>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.three },
  alignEnd: { alignItems: 'flex-end' },
  alignStart: { alignItems: 'flex-start' },
  column: { maxWidth: 360, width: '100%', gap: 8 },
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
  preview: { maxWidth: '85%', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18 },
  previewText: { fontSize: 17, lineHeight: 22 },
  timestamp: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500', marginHorizontal: 6 },
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
