import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar } from '@/components/avatar';
import { HeaderAction } from '@/components/header-action';
import { Icon, type IconName } from '@/components/icon';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useBlocks } from '@/context/blocks';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfile } from '@/hooks/use-user-profile';
import { formatPresence, isOnline } from '@/lib/chat';
import { confirmDestructive } from '@/lib/confirm';
import { haptics } from '@/lib/haptics';
import { REPORT_REASONS, submitReport, type ReportReason } from '@/lib/moderation';

/**
 * Contact sheet: profile, block/unblock and report. Opened from the chat header,
 * or from a message's long-press menu with `report=1` to jump straight to reasons.
 */
export default function UserScreen() {
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    report?: string;
    chatId?: string;
    messageId?: string;
    messageText?: string;
  }>();
  const { user } = useAuth();
  const { isBlocked, block, unblock } = useBlocks();
  const theme = useTheme();
  const profile = useUserProfile(params.id);
  const name = profile?.name ?? params.name ?? 'User';
  const blocked = isBlocked(params.id);
  const [reporting, setReporting] = useState(params.report === '1');
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);

  function toggleBlock() {
    if (blocked) {
      unblock(params.id).then(() => haptics.success(), () => haptics.error());
      return;
    }
    haptics.warning();
    confirmDestructive({
      title: `Block ${name}?`,
      message: `${name} won't be able to message you. They won't be told that you blocked them.`,
      confirmLabel: 'Block',
      onConfirm: () => block(params.id).then(() => haptics.success(), () => haptics.error()),
    });
  }

  async function report(reason: ReportReason) {
    if (busy) return;
    setBusy(true);
    try {
      await submitReport({
        reporterId: user!.uid,
        reportedUserId: params.id,
        reason,
        chatId: params.chatId,
        messageId: params.messageId,
        messageText: params.messageText,
      });
      haptics.success();
      setReported(true);
      setReporting(false);
    } catch {
      haptics.error();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.groupedBackground }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: reporting ? 'Report' : '' }} />
      <HeaderAction placement="right" label="Done" bold onPress={() => router.back()} />

      <View style={styles.hero}>
        <Avatar
          id={params.id}
          name={name}
          size={96}
          online={isOnline(profile?.lastSeen)}
          uri={profile?.avatarUrl}
        />
        <Text style={[styles.name, { color: theme.text }]}>{name}</Text>
        <Text style={[styles.presence, { color: theme.textSecondary }]}>
          {blocked ? 'Blocked' : formatPresence(profile?.lastSeen)}
        </Text>
      </View>

      {reported ? (
        <Animated.View entering={FadeIn} style={[styles.card, styles.notice, { backgroundColor: theme.card }]}>
          <Icon name="checkmark.circle.fill" size={22} color="#34C759" fallback="✓" />
          <Text style={[styles.noticeText, { color: theme.text }]}>
            Thanks for reporting. Our team will review it within 24 hours.
            {blocked ? '' : ` You can also block ${name}.`}
          </Text>
        </Animated.View>
      ) : null}

      {reporting ? (
        <>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
            {params.messageId ? 'WHY ARE YOU REPORTING THIS MESSAGE?' : `WHY ARE YOU REPORTING ${name.toUpperCase()}?`}
          </Text>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            {REPORT_REASONS.map((reason) => (
              <Row key={reason} label={reason} onPress={() => report(reason)} chevron />
            ))}
          </View>
          <Text style={[styles.footer, { color: theme.textSecondary }]}>
            {name} won&apos;t know who reported them.
          </Text>
        </>
      ) : (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Row
            icon="hand.raised.fill"
            label={blocked ? `Unblock ${name}` : `Block ${name}`}
            destructive={!blocked}
            onPress={toggleBlock}
          />
          {!reported ? (
            <Row
              icon="exclamationmark.bubble.fill"
              label={`Report ${name}`}
              destructive
              onPress={() => setReporting(true)}
            />
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

function Row({ icon, label, destructive, chevron, onPress }: {
  icon?: IconName;
  label: string;
  destructive?: boolean;
  chevron?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = destructive ? '#FF3B30' : theme.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
      {icon ? <Icon name={icon} size={18} color={color} fallback="" /> : null}
      <View style={[styles.rowBody, { borderBottomColor: theme.separator }]}>
        <Text style={[styles.rowText, { color }]}>{label}</Text>
        {chevron ? <Icon name="chevron.right" size={13} color={theme.textSecondary} fallback="" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  hero: { alignItems: 'center', gap: 6, paddingVertical: Spacing.four },
  name: { fontSize: 26, fontWeight: '700', marginTop: Spacing.two },
  presence: { fontSize: 15 },
  card: { borderRadius: 12, overflow: 'hidden' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.three },
  noticeText: { flex: 1, fontSize: 15, lineHeight: 20 },
  sectionHeader: { fontSize: 13, marginTop: Spacing.two, marginLeft: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.three, gap: 12 },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingRight: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, fontSize: 17 },
  footer: { fontSize: 13, marginHorizontal: Spacing.three },
});
