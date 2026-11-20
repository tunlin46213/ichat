import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { toast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useChats } from '@/context/chats';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import { otherMemberId } from '@/lib/chat';
import { confirmDestructive } from '@/lib/confirm';
import { haptics } from '@/lib/haptics';
import { useStarred } from '@/lib/starred';
import { chatUsage, clearOldMedia, formatBytes, FREE_STORAGE_BYTES, type ChatUsage } from '@/lib/storage-usage';

const AGES = [
  { label: 'Older than 1 month', days: 30 },
  { label: 'Older than 3 months', days: 90 },
  { label: 'Older than 1 year', days: 365 },
];

/**
 * Settings → Storage. Photos and voice notes live in Firestore (free plan: 1 GB for the
 * whole app), so this shows how much each chat uses and clears old media when needed.
 */
export default function StorageScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const myUid = user!.uid;
  const { chats } = useChats();
  const starred = useStarred(myUid);
  const [loaded, setUsage] = useState<Record<string, ChatUsage> | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const others = (chats ?? []).map((c) => otherMemberId(c, myUid));
  const profiles = useUserProfiles(others);
  const chatIds = (chats ?? []).map((c) => c.id).join(',');

  useEffect(() => {
    if (!chatIds) return;
    let cancelled = false;
    Promise.all(chatIds.split(',').map(chatUsage)).then(
      (list) => !cancelled && setUsage(Object.fromEntries(list.map((u) => [u.chatId, u]))),
      () => !cancelled && setFailed(true)
    );
    return () => {
      cancelled = true;
    };
  }, [chatIds, reload]);

  // No chats yet: nothing to add up (the effect never runs).
  const usage = chats && chats.length === 0 ? {} : loaded;
  const total = usage ? Object.values(usage).reduce((n, u) => n + u.bytes, 0) : 0;
  const share = Math.min(1, total / FREE_STORAGE_BYTES);
  const barColor = share > 0.8 ? '#FF3B30' : share > 0.5 ? '#FF9500' : theme.accent;

  function clear(days: number, label: string) {
    confirmDestructive({
      title: `Clear photos & voice ${label.toLowerCase()}?`,
      message:
        'They are removed for both people in each chat (the messages stay, marked "Photo unavailable"). Starred messages are kept. This can’t be undone.',
      confirmLabel: 'Clear',
      onConfirm: async () => {
        const keep = new Set((starred ?? []).map((s) => s.messageId));
        setBusy('Clearing…');
        let cleared = 0;
        try {
          for (const chat of chats ?? []) {
            cleared += await clearOldMedia(chat.id, days, keep, 3000 - cleared, (n) =>
              setBusy(`Clearing… ${cleared + n}`)
            );
          }
          haptics.success();
          toast.success(cleared ? `Cleared ${cleared} photos & voice messages` : 'Nothing that old to clear', 'trash.fill');
        } catch {
          toast.error(
            cleared ? `Cleared ${cleared}, then stopped. Try again later.` : 'Could not clear. Check your connection.'
          );
        } finally {
          setBusy(null);
          setUsage(null);
          setReload((n) => n + 1);
        }
      },
    });
  }

  const card = [styles.card, { backgroundColor: theme.card }];

  return (
    <ScrollView
      style={{ backgroundColor: theme.groupedBackground }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <View style={[card, styles.summary]}>
        {usage ? (
          <>
            <Text style={[styles.big, { color: theme.text }]}>≈ {formatBytes(total)}</Text>
            <Text style={[styles.sub, { color: theme.textSecondary }]}>
              used by your chats, of the 1 GB free storage for all of iChat
            </Text>
            <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.fill, { width: `${Math.max(2, share * 100)}%`, backgroundColor: barColor }]} />
            </View>
            {share > 0.8 ? (
              <Text style={[styles.warn]}>Almost full. Clear old photos below, or iChat will stop saving new ones.</Text>
            ) : null}
          </>
        ) : failed ? (
          <Text style={[styles.sub, { color: theme.textSecondary }]}>Could not load storage. Check your connection.</Text>
        ) : (
          <ActivityIndicator style={styles.loading} />
        )}
      </View>

      <Text style={[styles.header, { color: theme.textSecondary }]}>BY CHAT</Text>
      <View style={card}>
        {(chats ?? []).map((chat, i) => {
          const otherId = otherMemberId(chat, myUid);
          const name = profiles[otherId]?.name ?? chat.names?.[otherId] ?? 'Chat';
          const u = usage?.[chat.id];
          return (
            <View key={chat.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator }]}>
              <Avatar id={otherId} name={name} size={36} uri={profiles[otherId]?.avatarUrl} />
              <View style={styles.flex}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={[styles.sub, { color: theme.textSecondary }]}>
                  {u ? `${u.media} photos & voice · ${u.messages} messages` : '…'}
                </Text>
              </View>
              <Text style={[styles.size, { color: theme.text }]}>{u ? formatBytes(u.bytes) : ''}</Text>
            </View>
          );
        })}
      </View>

      <Text style={[styles.header, { color: theme.textSecondary }]}>CLEAR OLD PHOTOS & VOICE</Text>
      <View style={card}>
        {AGES.map((a, i) => (
          <Pressable
            key={a.days}
            onPress={() => clear(a.days, a.label)}
            disabled={!!busy || !chats?.length}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator },
              pressed && { backgroundColor: theme.backgroundSelected },
            ]}>
            <Text style={[styles.action, { color: busy ? theme.textSecondary : '#FF3B30' }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator />
          <Text style={[styles.sub, { color: theme.textSecondary }]}>{busy}</Text>
        </View>
      ) : (
        <Text style={[styles.footer, { color: theme.textSecondary }]}>
          Clears them for both people in the chat. Messages and starred items stay. Sizes of older photos are estimated.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  card: { borderRadius: Radius.lg, overflow: 'hidden' },
  summary: { padding: Spacing.three, gap: 6 },
  big: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 13 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  fill: { height: 8, borderRadius: 4 },
  warn: { fontSize: 13, color: '#FF3B30', fontWeight: '600', marginTop: 4 },
  loading: { marginVertical: Spacing.three },
  header: { fontSize: 13, fontWeight: '600', marginTop: Spacing.two, marginLeft: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.three, minHeight: 56 },
  name: { fontSize: 16, fontWeight: '600' },
  size: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  action: { fontSize: 17 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: Spacing.two },
  footer: { fontSize: 13, lineHeight: 18, marginHorizontal: Spacing.three },
});
