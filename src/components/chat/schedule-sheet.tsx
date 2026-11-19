import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { ScalePressable } from '@/components/scale-pressable';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

const DAYS_AHEAD = 14;
const MINUTE = 60_000;

function at(dayOffset: number, hour: number, minute = 0, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function formatWhen(d: Date, now = new Date()) {
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date(now).toDateString();
  const tomorrow = at(1, 0, 0, now).toDateString();
  if (d.toDateString() === today) return `Today ${time}`;
  if (d.toDateString() === tomorrow) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

/**
 * "Send later" sheet: quick picks (in an hour, tonight, tomorrow morning) or any day in
 * the next two weeks at any half hour.
 */
export function ScheduleSheet({ text, openedAt, onSchedule, onClose }: {
  text: string;
  /** when the sheet opened (keeps the choices stable while it's up) */
  openedAt: number;
  onSchedule: (when: Date) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const now = new Date(openedAt);
  const presets: { label: string; icon: IconName; fallback: string; when: Date }[] = [
    { label: 'In 1 hour', icon: 'clock', fallback: '🕐', when: new Date(openedAt + 60 * MINUTE) },
    ...(now.getHours() < 20 ? [{ label: 'Tonight', icon: 'moon.stars.fill' as IconName, fallback: '🌙', when: at(0, 20, 0, now) }] : []),
    { label: 'Tomorrow morning', icon: 'sunrise.fill', fallback: '🌅', when: at(1, 8, 0, now) },
    { label: 'Tomorrow evening', icon: 'sunset.fill', fallback: '🌇', when: at(1, 19, 0, now) },
  ];
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<number | null>(null);
  // Half-hour slots for the chosen day, only those still in the future.
  const slots = Array.from({ length: 48 }, (_, i) => at(day, Math.floor(i / 2), (i % 2) * 30, now)).filter(
    (d) => d.getTime() > openedAt + 5 * MINUTE
  );
  const custom = slot !== null ? slots[slot] : null;

  function pick(when: Date) {
    haptics.success();
    onSchedule(when);
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        entering={FadeIn.duration(180)}
        style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[styles.grabber, { backgroundColor: theme.separator }]} />
        <Text style={[styles.title, { color: theme.text }]}>Schedule message</Text>
        <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={2}>
          “{text}”
        </Text>

        <View style={styles.presets}>
          {presets.map((p) => (
            <ScalePressable
              key={p.label}
              onPress={() => pick(p.when)}
              accessibilityRole="button"
              accessibilityLabel={`${p.label}, ${formatWhen(p.when, now)}`}
              style={[styles.preset, { backgroundColor: theme.backgroundElement }]}>
              <Icon name={p.icon} size={18} color={theme.accent} fallback={p.fallback} />
              <Text style={[styles.presetLabel, { color: theme.text }]}>{p.label}</Text>
              <Text style={[styles.presetWhen, { color: theme.textSecondary }]}>{formatWhen(p.when, now)}</Text>
            </ScalePressable>
          ))}
        </View>

        <Text style={[styles.section, { color: theme.textSecondary }]}>PICK A TIME</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {Array.from({ length: DAYS_AHEAD }, (_, i) => {
            const d = at(i, 12, 0, now);
            const selected = i === day;
            return (
              <Pressable
                key={i}
                onPress={() => {
                  haptics.selection();
                  setDay(i);
                  setSlot(null);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.dayChip, { backgroundColor: selected ? theme.accent : theme.backgroundElement }]}>
                <Text style={[styles.dayTop, { color: selected ? '#fff' : theme.textSecondary }]}>
                  {i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString([], { weekday: 'short' })}
                </Text>
                <Text style={[styles.dayNum, { color: selected ? '#fff' : theme.text }]}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {slots.map((d, i) => {
            const selected = i === slot;
            return (
              <Pressable
                key={d.getTime()}
                onPress={() => {
                  haptics.selection();
                  setSlot(i);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.timeChip, { backgroundColor: selected ? theme.accent : theme.backgroundElement }]}>
                <Text style={[styles.timeText, { color: selected ? '#fff' : theme.text }]}>
                  {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScalePressable
          onPress={() => custom && pick(custom)}
          disabled={!custom}
          accessibilityRole="button"
          style={[styles.confirm, { backgroundColor: theme.accent, opacity: custom ? 1 : 0.45 }]}>
          <Icon name="clock" size={16} color="#fff" fallback="🕓" />
          <Text style={styles.confirmText}>{custom ? `Schedule for ${formatWhen(custom, now)}` : 'Choose a time'}</Text>
        </ScalePressable>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
  },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3 },
  title: { fontSize: 20, fontWeight: '700' },
  preview: { fontSize: 15, fontStyle: 'italic', marginTop: -4 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { width: '48.5%', flexGrow: 1, borderRadius: Radius.md, padding: 12, gap: 3 },
  presetLabel: { fontSize: 15, fontWeight: '600' },
  presetWhen: { fontSize: 12 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 4 },
  chips: { gap: 8 },
  dayChip: { width: 52, height: 58, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  dayTop: { fontSize: 11, fontWeight: '600' },
  dayNum: { fontSize: 19, fontWeight: '700' },
  timeChip: { paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: 'center' },
  timeText: { fontSize: 14, fontWeight: '600' },
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 16,
    marginTop: 6,
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
