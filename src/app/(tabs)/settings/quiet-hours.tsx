import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { toast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import { formatHour, saveQuietHours, useQuietHours, type QuietHours } from '@/lib/quiet-hours';
import { setStoriesMuted, setStoryAlerts, useStoryPrefs } from '@/lib/story-prefs';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * Settings → Alert Options: story alerts, quiet hours (alerts arrive without sound) and
 * the people whose stories I muted.
 */
export default function QuietHoursScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const uid = user!.uid;
  const quiet = useQuietHours(uid);
  const storyPrefs = useStoryPrefs(uid);
  const mutedProfiles = useUserProfiles(storyPrefs?.mutedStories ?? []);

  function save(next: QuietHours) {
    haptics.selection();
    saveQuietHours(uid, next).catch(() => toast.error('Could not save. Check your connection.'));
  }

  if (!quiet || !storyPrefs) return <ActivityIndicator style={styles.loading} />;
  const card = [styles.card, { backgroundColor: theme.card }];

  return (
    <ScrollView
      style={{ backgroundColor: theme.groupedBackground }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <View style={card}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.text }]}>New story alerts</Text>
          <Switch
            value={storyPrefs.storyAlerts}
            onValueChange={(on) => {
              haptics.selection();
              setStoryAlerts(uid, on).catch(() => toast.error('Could not save. Check your connection.'));
            }}
            trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
          />
        </View>
      </View>
      <Text style={[styles.footer, { color: theme.textSecondary }]}>
        An alert when someone you chat with posts a story. Muted people never send one.
      </Text>

      <View style={card}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.text }]}>Quiet Hours</Text>
          <Switch value={quiet.on} onValueChange={(on) => save({ ...quiet, on })} trackColor={{ false: theme.backgroundSelected, true: theme.accent }} />
        </View>
      </View>
      <Text style={[styles.footer, { color: theme.textSecondary }]}>
        {quiet.on
          ? `Every day from ${formatHour(quiet.start)} to ${formatHour(quiet.end)}, message alerts arrive silently.`
          : 'Alerts arrive silently during the hours you choose, so they don’t wake you up.'}
      </Text>

      {quiet.on ? (
        <>
          <HourPicker title="FROM" value={quiet.start} onChange={(start) => save({ ...quiet, start })} />
          <HourPicker title="UNTIL" value={quiet.end} onChange={(end) => save({ ...quiet, end })} />
          <View style={card}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.text }]}>Let calls ring</Text>
              <Switch
                value={quiet.calls}
                onValueChange={(calls) => save({ ...quiet, calls })}
                trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
              />
            </View>
          </View>
          <Text style={[styles.footer, { color: theme.textSecondary }]}>
            On: calls still ring during quiet hours. Off: they arrive silently like messages.
          </Text>
        </>
      ) : null}

      {storyPrefs.mutedStories.length ? (
        <>
          <Text style={[styles.header, { color: theme.textSecondary }]}>MUTED STORIES</Text>
          <View style={card}>
            {storyPrefs.mutedStories.map((id, i) => (
              <View key={id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator }]}>
                <Text style={[styles.label, { color: theme.text }]} numberOfLines={1}>
                  {mutedProfiles[id]?.name ?? 'Someone'}
                </Text>
                <Pressable
                  onPress={() =>
                    setStoriesMuted(uid, id, false).then(
                      () => toast.success('Stories unmuted'),
                      () => toast.error('Could not change it. Try again.')
                    )
                  }
                  hitSlop={8}
                  accessibilityRole="button">
                  <Text style={[styles.unmute, { color: theme.accent }]}>Unmute</Text>
                </Pressable>
              </View>
            ))}
          </View>
          <Text style={[styles.footer, { color: theme.textSecondary }]}>
            To mute someone, press and hold their photo above your chats.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

function HourPicker({ title, value, onChange }: { title: string; value: number; onChange: (h: number) => void }) {
  const theme = useTheme();
  return (
    <View>
      <Text style={[styles.header, { color: theme.textSecondary }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {HOURS.map((h) => {
          const selected = h === value;
          return (
            <Pressable
              key={h}
              onPress={() => onChange(h)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.chip, { backgroundColor: selected ? theme.accent : theme.card }]}>
              <Text style={[styles.chipText, { color: selected ? '#fff' : theme.text }]}>{formatHour(h)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.five },
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  card: { borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: Spacing.three },
  label: { flex: 1, fontSize: 17 },
  footer: { fontSize: 13, lineHeight: 18, marginHorizontal: Spacing.three },
  header: { fontSize: 13, fontWeight: '600', marginLeft: Spacing.three, marginBottom: 6, marginTop: Spacing.two },
  chips: { gap: 8, paddingHorizontal: 2 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '600' },
  unmute: { fontSize: 16, fontWeight: '600' },
});
