import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { afterModalClose } from '@/components/action-sheet';
import { Avatar, colorsFor } from '@/components/avatar';
import { useCalls } from '@/calls/context';
import { AuroraBackground } from '@/components/aurora';
import { SharedMediaSection } from '@/components/profile/shared-media';
import { ScalePressable } from '@/components/scale-pressable';
import { toast } from '@/components/toast';
import { HeaderAction } from '@/components/header-action';
import { Icon, type IconName } from '@/components/icon';
import { Elevation, Radius, Spacing, Type } from '@/constants/theme';
import { ChatAppearanceScope, useAppearance } from '@/context/appearance';
import { useAuth } from '@/context/auth';
import { useBlocks } from '@/context/blocks';
import { useChats } from '@/context/chats';
import { useSharedMedia } from '@/hooks/use-shared-media';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfile } from '@/hooks/use-user-profile';
import { chatIdFor, formatPresence, isOnline } from '@/lib/chat';
import { requestChatSearch } from '@/lib/chat-events';
import { confirmDestructive } from '@/lib/confirm';
import { haptics } from '@/lib/haptics';
import { REPORT_REASONS, submitReport, type ReportReason } from '@/lib/moderation';
import { callsUnavailableReason } from '@/lib/runtime';

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/**
 * Contact sheet: profile, quick actions (call, video, search, mute), this chat's own
 * theme, shared photos / voice / links, and block / report. Opened from the chat
 * header, or from a message's long-press menu with `report=1` to jump to reasons.
 */
export default function UserRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  // The hero and pickers preview this chat's own colors.
  return (
    <ChatAppearanceScope chatId={user ? chatIdFor(user.uid, id) : ''}>
      <UserScreen />
    </ChatAppearanceScope>
  );
}

function UserScreen() {
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
  const { startCall } = useCalls();
  const { bubbleColor, chatPrefs, setChatPrefs } = useAppearance();
  const { chats } = useChats();
  const myUid = user!.uid;
  const isMe = params.id === myUid;
  const chatId = isMe ? null : chatIdFor(myUid, params.id);
  const chat = chats?.find((c) => c.id === chatId) ?? null;
  const media = useSharedMedia(chat ? chatId : null, chat?.hiddenAt?.[myUid]?.toMillis() ?? 0);
  const muted = !!chatId && !!chatPrefs(chatId).muted;
  const online = isOnline(profile?.lastSeen);
  const headerHeight = useHeaderHeight();
  const tint = colorsFor(params.id);

  async function call(video: boolean) {
    const title = video ? 'Video calls' : 'Voice calls';
    if (!startCall) return showAlert(title, callsUnavailableReason() ?? 'Calls are connecting. Try again in a moment.');
    if (blocked) return showAlert(title, `Unblock ${name} to call them.`);
    try {
      haptics.medium();
      await startCall({ id: params.id, name }, { video });
    } catch (err) {
      haptics.error();
      const detail = err instanceof Error && err.message ? `\n\n(${err.message.slice(0, 200)})` : '';
      showAlert('Call failed', `Could not start the call.${detail}`);
    }
  }

  function search() {
    if (!chatId) return;
    router.back();
    afterModalClose(() => requestChatSearch(chatId));
  }

  function toggleMute() {
    if (!chatId) return;
    setChatPrefs(chatId, { muted: muted ? undefined : true });
    toast.success(muted ? 'Unmuted' : 'Muted. No banner or sound for this chat.', muted ? 'bell.fill' : 'bell.slash.fill');
  }

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
    <View style={styles.flex}>
    <AuroraBackground height={520} />
    <ScrollView
      style={styles.transparent}
      // The cover runs up behind the (transparent) header, so no automatic inset.
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: reporting ? 'Report' : '',
          headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' },
          headerShadowVisible: false,
        }}
      />
      <HeaderAction placement="right" label="Done" bold onPress={() => router.back()} />

      <View style={styles.hero}>
        {/* Cover: their photo, heavily blurred, melting into the page (or their colors). */}
        <View style={[styles.cover, { height: headerHeight + 150 }]}>
          {profile?.avatarUrl ? (
            <Image
              source={{ uri: profile.avatarUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              blurRadius={45}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundImage: `linear-gradient(135deg, ${tint[0]} 0%, ${tint[1]} 55%, ${bubbleColor} 100%)` },
              ]}
            />
          )}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundImage: `linear-gradient(180deg, ${theme.background}22 0%, ${theme.background}66 55%, ${theme.background} 100%)` },
            ]}
          />
        </View>
        <Animated.View
          entering={FadeInDown.springify().damping(16)}
          style={[
            styles.avatarRing,
            { backgroundImage: `linear-gradient(135deg, ${bubbleColor} 0%, #FF6CAB 100%)`, boxShadow: `0 10px 30px ${bubbleColor}55` },
          ]}>
          <View style={[styles.avatarGap, { backgroundColor: theme.background }]}>
            <Avatar id={params.id} name={name} size={112} online={online && !blocked} uri={profile?.avatarUrl} />
          </View>
        </Animated.View>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {name}
        </Text>
        <View
          style={[
            styles.presencePill,
            {
              backgroundColor: online && !blocked ? `${theme.success}22` : theme.glassStrong,
              borderColor: online && !blocked ? `${theme.success}55` : theme.glassBorder,
            },
          ]}>
          {online && !blocked ? <View style={styles.onlineDot} /> : null}
          <Text style={[styles.presence, { color: online && !blocked ? theme.success : theme.textSecondary }]}>
            {blocked ? 'Blocked' : formatPresence(profile?.lastSeen) || 'Offline'}
          </Text>
          {muted ? <Icon name="bell.slash.fill" size={12} color={theme.textSecondary} fallback="🔕" /> : null}
        </View>
      </View>

      {!reporting && chatId ? (
        <Animated.View entering={FadeInDown.delay(60).springify().damping(18)} style={styles.actions}>
          <QuickAction icon="phone.fill" fallback="📞" label="Call" onPress={() => call(false)} />
          <QuickAction icon="video.fill" fallback="🎥" label="Video" onPress={() => call(true)} />
          <QuickAction icon="magnifyingglass" fallback="🔍" label="Search" onPress={search} />
          <QuickAction
            icon={muted ? 'bell.slash.fill' : 'bell.fill'}
            fallback={muted ? '🔕' : '🔔'}
            label={muted ? 'Unmute' : 'Mute'}
            active={muted}
            onPress={toggleMute}
          />
        </Animated.View>
      ) : null}

      {reported ? (
        <Animated.View entering={FadeIn} style={[styles.card, styles.notice, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}>
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
          <View style={[styles.card, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}>
            {REPORT_REASONS.map((reason) => (
              <Row key={reason} label={reason} onPress={() => report(reason)} chevron />
            ))}
          </View>
          <Text style={[styles.footer, { color: theme.textSecondary }]}>
            {name} won&apos;t know who reported them.
          </Text>
        </>
      ) : (
        <>
        {chatId ? (
          <>
            <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>SHARED</Text>
            <SharedMediaSection
              chatId={chatId}
              media={media}
              senderName={(uid) => (uid === myUid ? 'You' : name)}
            />
          </>
        ) : null}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>PRIVACY</Text>
        <View style={[styles.card, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}>
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
        </>
      )}
    </ScrollView>
    </View>
  );
}

function QuickAction({ icon, fallback, label, active, onPress }: {
  icon: IconName;
  fallback: string;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { bubbleColor } = useAppearance();
  // The wrapper takes the flex share; ScalePressable sizes to its content otherwise.
  return (
    <View style={styles.actionSlot}>
      <ScalePressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.action,
          active
            ? { backgroundColor: bubbleColor, borderColor: bubbleColor }
            : { backgroundColor: theme.glassCard, borderColor: theme.glassBorder },
        ]}>
        <Icon name={icon} size={21} color={active ? '#fff' : bubbleColor} fallback={fallback} />
        <Text style={[styles.actionLabel, { color: active ? '#fff' : theme.text }]}>{label}</Text>
      </ScalePressable>
    </View>
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
  hero: { alignItems: 'center', gap: 4, paddingBottom: Spacing.two },
  cover: {
    alignSelf: 'stretch',
    marginHorizontal: -Spacing.three,
    marginTop: -Spacing.three,
    marginBottom: -66,
    overflow: 'hidden',
  },
  avatarRing: { padding: 3, borderRadius: 70 },
  avatarGap: { padding: 3, borderRadius: 66 },
  name: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginTop: Spacing.two, maxWidth: '90%' },
  presencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' },
  presence: { fontSize: 13, fontWeight: '600' },
  flex: { flex: 1 },
  transparent: { backgroundColor: 'transparent' },
  actionSlot: { flex: 1 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: Spacing.two },
  action: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 64,
    borderRadius: Radius.md,
    boxShadow: Elevation.card,
  },
  actionLabel: { fontSize: 12, fontWeight: '600' },
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, boxShadow: Elevation.card, overflow: 'hidden' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.three },
  noticeText: { flex: 1, fontSize: 15, lineHeight: 20 },
  sectionHeader: { ...Type.footnote, letterSpacing: 0.2, marginTop: Spacing.two, marginLeft: Spacing.three },
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
