import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ScalePressable } from '@/components/scale-pressable';
import { toast } from '@/components/toast';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addCountdown, formatCountdown, removeCountdown, type Countdown } from '@/lib/chat';
import { haptics } from '@/lib/haptics';

export type UpcomingCountdown = Countdown & { id: string; days: number };

const EMOJIS = ['🎂', '✈️', '⛰️', '🏖️', '🎉', '💍', '🎓', '❤️', '🎄', '📅'];
const DAYS_AHEAD = 120;

/** Slim bar under the header: the next countdown, tap for all of them. */
export function CountdownBar({ next, more, onPress }: { next: UpcomingCountdown; more: number; onPress: () => void }) {
  const theme = useTheme();
  const today = next.days === 0;
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${next.title}, ${formatCountdown(next.days)}. Show countdowns`}
        style={[
          styles.bar,
          {
            backgroundColor: today ? `${theme.accent}26` : theme.glassCard,
            borderColor: today ? `${theme.accent}66` : theme.glassBorder,
          },
        ]}>
        <Text style={styles.barEmoji}>{next.emoji}</Text>
        <Text style={[styles.barTitle, { color: theme.text }]} numberOfLines={1}>
          {next.title}
        </Text>
        <View style={[styles.barPill, { backgroundColor: today ? theme.accent : theme.glassStrong }]}>
          <Text style={[styles.barDays, { color: today ? '#fff' : theme.accent }]}>
            {next.days > 1 && next.days < 60 ? `${next.days} days` : formatCountdown(next.days)}
          </Text>
        </View>
        {more > 0 ? <Text style={[styles.more, { color: theme.textSecondary }]}>+{more}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

function dayAt(offset: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

/** All countdowns in this chat, plus a form to add one. Both people can add/remove. */
export function CountdownSheet({ chatId, myUid, countdowns, startAdding, onClose }: {
  chatId: string;
  myUid: string;
  countdowns: UpcomingCountdown[];
  startAdding: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [adding, setAdding] = useState(startAdding || countdowns.length === 0);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [day, setDay] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) return toast.error('Give the countdown a name.');
    if (day === null) return toast.error('Pick a date.');
    setBusy(true);
    try {
      await addCountdown(chatId, myUid, title, emoji, dayAt(day));
      toast.success('Countdown added', 'calendar');
      onClose();
    } catch {
      toast.error('Could not add the countdown.');
      setBusy(false);
    }
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.springify().damping(20)}
        style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[styles.grabber, { backgroundColor: theme.separator }]} />
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text }]}>{adding ? 'New countdown' : 'Countdowns'}</Text>
          {!adding ? (
            <Pressable onPress={() => setAdding(true)} hitSlop={8} accessibilityRole="button">
              <Icon name="plus.circle.fill" size={26} color={theme.accent} fallback="＋" />
            </Pressable>
          ) : null}
        </View>

        {adding ? (
          <>
            <TextInput
              autoFocus
              value={title}
              onChangeText={setTitle}
              placeholder="Trip to Bagan, Bae's birthday…"
              placeholderTextColor={theme.textSecondary}
              maxLength={60}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => {
                    haptics.selection();
                    setEmoji(e);
                  }}
                  accessibilityLabel={`Emoji ${e}`}
                  style={[styles.emojiChip, e === emoji && { backgroundColor: `${theme.accent}33`, borderColor: theme.accent }]}>
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {Array.from({ length: DAYS_AHEAD }, (_, i) => {
                const d = dayAt(i + 1);
                const selected = day === i + 1;
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      haptics.selection();
                      setDay(i + 1);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[styles.dayChip, { backgroundColor: selected ? theme.accent : theme.backgroundElement }]}>
                    <Text style={[styles.dayTop, { color: selected ? '#fff' : theme.textSecondary }]}>
                      {d.toLocaleDateString([], { month: 'short' })}
                    </Text>
                    <Text style={[styles.dayNum, { color: selected ? '#fff' : theme.text }]}>{d.getDate()}</Text>
                    <Text style={[styles.dayTop, { color: selected ? '#fff' : theme.textSecondary }]}>
                      {d.toLocaleDateString([], { weekday: 'short' })}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScalePressable
              onPress={save}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.confirm, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]}>
              <Text style={styles.confirmText}>
                {emoji} {day ? `Count down to ${dayAt(day).toLocaleDateString([], { day: 'numeric', month: 'short' })}` : 'Add countdown'}
              </Text>
            </ScalePressable>
          </>
        ) : (
          <ScrollView style={styles.list}>
            {countdowns.map((c) => (
              <View key={c.id} style={[styles.row, { borderBottomColor: theme.separator }]}>
                <Text style={styles.rowEmoji}>{c.emoji}</Text>
                <View style={styles.flex}>
                  <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                    {c.title}
                  </Text>
                  <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
                    {c.at.toDate().toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <Text style={[styles.rowDays, { color: c.days === 0 ? theme.accent : theme.text }]}>
                  {formatCountdown(c.days)}
                </Text>
                <Pressable
                  onPress={() =>
                    removeCountdown(chatId, c.id).then(
                      () => toast.success('Countdown removed', 'trash.fill'),
                      () => toast.error('Could not remove it.')
                    )
                  }
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${c.title}`}>
                  <Icon name="xmark.circle.fill" size={20} color={theme.textSecondary} fallback="✕" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 6,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  barEmoji: { fontSize: 18 },
  barTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  barPill: { paddingHorizontal: 10, height: 24, borderRadius: 12, justifyContent: 'center' },
  barDays: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  more: { fontSize: 12, fontWeight: '600' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
    maxHeight: '80%',
  },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '700' },
  input: {
    fontSize: 17,
    height: 48,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  chips: { gap: 8 },
  emojiChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  emoji: { fontSize: 24 },
  dayChip: { width: 54, height: 66, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  dayTop: { fontSize: 11, fontWeight: '600' },
  dayNum: { fontSize: 19, fontWeight: '700' },
  confirm: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowEmoji: { fontSize: 28 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 1 },
  rowDays: { fontSize: 14, fontWeight: '700' },
});
