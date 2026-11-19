import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { useTheme } from '@/hooks/use-theme';
import type { Message } from '@/lib/chat';

/** "Who reacted": one row per person with their emoji. Tap your own to remove it. */
export function ReactionsSheet({ message, people, myUid, onRemoveMine, onClose }: {
  message: Message | null;
  /** uid → name and photo */
  people: Record<string, { name: string; avatarUrl?: string | null }>;
  myUid: string;
  onRemoveMine: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  if (!message) return null;
  const entries = Object.entries(message.reactions ?? {}).sort(([a], [b]) =>
    a === myUid ? -1 : b === myUid ? 1 : 0
  );

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        entering={FadeIn.duration(180)}
        style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[styles.grabber, { backgroundColor: theme.separator }]} />
        <Text style={[styles.title, { color: theme.text }]}>
          {entries.length} {entries.length === 1 ? 'Reaction' : 'Reactions'}
        </Text>
        {entries.map(([uid, emoji]) => {
          const mine = uid === myUid;
          const person = people[uid];
          return (
            <Pressable
              key={uid}
              onPress={mine ? onRemoveMine : undefined}
              disabled={!mine}
              accessibilityRole={mine ? 'button' : 'text'}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: theme.separator },
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}>
              <Avatar id={uid} name={person?.name ?? '?'} size={40} uri={person?.avatarUrl} />
              <View style={styles.body}>
                <Text style={[styles.name, { color: theme.text }]}>{mine ? 'You' : person?.name ?? 'Someone'}</Text>
                {mine ? (
                  <Text style={[styles.hint, { color: theme.textSecondary }]}>Tap to remove</Text>
                ) : null}
              </View>
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  body: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13, marginTop: 1 },
  emoji: { fontSize: 28 },
});
