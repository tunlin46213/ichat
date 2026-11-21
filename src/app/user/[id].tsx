import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams, useNavigation, type Href } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useRef, useState, type ComponentRef } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { afterModalClose } from '@/components/action-sheet';
import { Avatar, colorsFor } from '@/components/avatar';
import { useCalls } from '@/calls/context';
import { UserMomentsGrid } from '@/components/moments/user-moments';
import { PopoverMenu, type PopoverAnchor, type PopoverItem } from '@/components/popover-menu';
import { SharedMediaSection, type ProfileTab } from '@/components/profile/shared-media';
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
import { useUserMoments } from '@/lib/moments';
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

  // Opened from this very chat: just go back to it. From anywhere else: close this sheet,
  // then open the chat (pushing it over the sheet would stack it oddly).
  const navigation = useNavigation();
  function message() {
    if (!chatId) return;
    if (blocked) return showAlert('Message', `Unblock ${name} to message them.`);
    haptics.light();
    const state = navigation.getState();
    const previous = state?.routes[(state.index ?? 0) - 1] as { name?: string; params?: { id?: string } } | undefined;
    router.back();
    if (previous?.name === 'chat/[id]' && previous.params?.id === chatId) return;
    afterModalClose(() =>
      router.push({ pathname: '/chat/[id]', params: { id: chatId, otherId: params.id, name } })
    );
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

  const loadedMoments = useUserMoments(params.id);
  const theirMoments = loadedMoments ?? [];
  const [tab, setTab] = useState<ProfileTab | null>(null);
  // Moments first when they have some (or while they load); otherwise what we've shared.
  const activeTab: ProfileTab =
    tab ?? (loadedMoments === null || theirMoments.length || !chat ? 'moments' : 'photos');
  const [menuAt, setMenuAt] = useState<PopoverAnchor | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const moreButton = useRef<ComponentRef<typeof View>>(null);

  function pick(next: ProfileTab) {
    haptics.selection();
    setTab(next);
  }

  const menuItems: PopoverItem[] = [
    ...(chat ? [{ label: 'Search in Chat', icon: 'magnifyingglass' as const, fallback: '🔍', onPress: search }] : []),
    ...(chatId
      ? [{
          label: muted ? 'Unmute' : 'Mute',
          icon: (muted ? 'bell.fill' : 'bell.slash.fill') as IconName,
          fallback: muted ? '🔔' : '🔕',
          onPress: toggleMute,
        }]
      : []),
    { label: blocked ? `Unblock ${name}` : `Block ${name}`, icon: 'hand.raised.fill', fallback: '✋', destructive: !blocked, onPress: toggleBlock },
    ...(!reported
      ? [{ label: `Report ${name}`, icon: 'exclamationmark.bubble.fill' as const, fallback: '⚠️', destructive: true, onPress: () => setReporting(true) }]
      : []),
  ];

  const stats: { tab: ProfileTab; label: string; count: number }[] = [
    { tab: 'moments', label: 'Moments', count: theirMoments.length },
    ...(chat
      ? ([
          { tab: 'photos', label: 'Photos', count: media.photos.length },
          { tab: 'voice', label: 'Voice', count: media.voice.length },
        ] as const)
      : []),
  ];

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
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

      {/* Cover: their photo, heavily blurred, melting into the page (or their colors). */}
      <View style={[styles.cover, { height: headerHeight + 260 }]}>
        {profile?.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={45} />
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
            {
              backgroundImage: `linear-gradient(180deg, ${theme.background}00 0%, ${theme.background}55 45%, ${theme.background}dd 80%, ${theme.background} 100%)`,
            },
          ]}
        />
      </View>

      <View style={[styles.hero, { paddingTop: headerHeight + 18 }]}>
        <Animated.View
          entering={FadeInDown.springify().damping(16)}
          style={[
            styles.avatarRing,
            { backgroundImage: `linear-gradient(135deg, ${bubbleColor} 0%, #FF6CAB 100%)`, boxShadow: `0 10px 30px ${bubbleColor}55` },
          ]}>
          <Pressable
            onPress={() => profile?.avatarUrl && setPhotoOpen(true)}
            disabled={!profile?.avatarUrl}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${name}'s photo`}
            style={[styles.avatarGap, { backgroundColor: theme.background }]}>
            <Avatar id={params.id} name={name} size={104} online={online && !blocked} uri={profile?.avatarUrl} />
          </Pressable>
        </Animated.View>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {isMe ? `${name} (You)` : name}
        </Text>
        <View style={styles.presenceRow}>
          {online && !blocked ? <View style={styles.onlineDot} /> : null}
          <Text style={[styles.presence, { color: online && !blocked ? theme.success : theme.textSecondary }]}>
            {blocked ? 'Blocked' : isMe ? 'This is how others see you' : formatPresence(profile?.lastSeen) || 'Offline'}
          </Text>
          {muted ? <Icon name="bell.slash.fill" size={12} color={theme.textSecondary} fallback="🔕" /> : null}
        </View>
        {profile?.bio ? (
          <Text style={[styles.bio, { color: theme.text }]} numberOfLines={3}>
            {profile.bio}
          </Text>
        ) : isMe ? (
          <Pressable
            onPress={() => {
              router.back();
              afterModalClose(() => router.navigate('/settings' as Href));
            }}
            accessibilityRole="button">
            <Text style={[styles.bio, { color: bubbleColor }]}>+ Add a bio</Text>
          </Pressable>
        ) : null}

        {!reporting ? (
          <View style={[styles.stats, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}>
            {stats.map((st, i) => (
              <Pressable
                key={st.tab}
                onPress={() => pick(st.tab)}
                accessibilityRole="button"
                accessibilityLabel={`${st.count} ${st.label}`}
                style={[styles.stat, i > 0 && { borderLeftColor: theme.separator, borderLeftWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.statCount, { color: activeTab === st.tab ? bubbleColor : theme.text }]}>{st.count}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{st.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {/* Actions: one clear primary button, the rest as round icons. */}
      {!reporting ? (
        <Animated.View entering={FadeInDown.delay(60).springify().damping(18)} style={styles.actions}>
          {isMe ? (
            <PrimaryButton
              icon="pencil"
              fallback="✎"
              label="Edit Profile"
              onPress={() => {
                router.back();
                afterModalClose(() => router.navigate('/settings' as Href));
              }}
            />
          ) : (
            <>
              <PrimaryButton icon="bubble.left.fill" fallback="💬" label="Message" onPress={message} />
              <RoundButton icon="phone.fill" fallback="📞" label="Call" onPress={() => call(false)} />
              <RoundButton icon="video.fill" fallback="🎥" label="Video" onPress={() => call(true)} />
              <View ref={moreButton} collapsable={false}>
                <RoundButton
                  icon="ellipsis"
                  fallback="•••"
                  label="More"
                  onPress={() =>
                    moreButton.current?.measureInWindow((x, y, width, height) => setMenuAt({ x, y, width, height }))
                  }
                />
              </View>
            </>
          )}
        </Animated.View>
      ) : null}

      {blocked && !reporting ? (
        <Animated.View entering={FadeIn} style={[styles.card, styles.notice, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}>
          <Icon name="hand.raised.fill" size={20} color="#FF3B30" fallback="✋" />
          <Text style={[styles.noticeText, { color: theme.text }]}>You blocked {name}.</Text>
          <Pressable onPress={toggleBlock} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.noticeAction, { color: bubbleColor }]}>Unblock</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {reported ? (
        <Animated.View entering={FadeIn} style={[styles.card, styles.notice, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}>
          <Icon name="checkmark.circle.fill" size={22} color="#34C759" fallback="✓" />
          <Text style={[styles.noticeText, { color: theme.text }]}>
            Thanks for reporting. Our team will review it within 24 hours.
            {blocked ? '' : ` You can also block ${name} from the ••• menu.`}
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
        <SharedMediaSection
          chatId={chat ? chatId : null}
          media={media}
          senderName={(uid) => (uid === myUid ? 'You' : name)}
          moments={{
            count: theirMoments.length,
            loading: loadedMoments === null,
            content: <UserMomentsGrid moments={theirMoments} />,
          }}
          tab={activeTab}
          onTab={pick}
        />
      )}
    </ScrollView>
    <PopoverMenu anchor={menuAt} items={menuItems} onClose={() => setMenuAt(null)} />
    {photoOpen && profile?.avatarUrl ? (
      <Modal transparent visible animationType="fade" onRequestClose={() => setPhotoOpen(false)} statusBarTranslucent>
        <Pressable style={styles.photoBackdrop} onPress={() => setPhotoOpen(false)} accessibilityLabel="Close photo">
          <Image source={{ uri: profile.avatarUrl }} style={styles.photoFull} contentFit="cover" />
          <Text style={styles.photoName}>{name}</Text>
        </Pressable>
      </Modal>
    ) : null}
    </View>
  );
}

/** The main action, filling the row (Message / Edit Profile). */
function PrimaryButton({ icon, fallback, label, onPress }: {
  icon: IconName;
  fallback: string;
  label: string;
  onPress: () => void;
}) {
  const { bubbleColor } = useAppearance();
  return (
    <View style={styles.flex}>
      <ScalePressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.primary, { backgroundColor: bubbleColor, boxShadow: `0 6px 18px ${bubbleColor}55` }]}>
        <Icon name={icon} size={18} color="#fff" fallback={fallback} />
        <Text style={styles.primaryText}>{label}</Text>
      </ScalePressable>
    </View>
  );
}

function RoundButton({ icon, fallback, label, onPress }: {
  icon: IconName;
  fallback: string;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { bubbleColor } = useAppearance();
  return (
    <ScalePressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.round, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}>
      <Icon name={icon} size={19} color={bubbleColor} fallback={fallback} />
    </ScalePressable>
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
  cover: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  presenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bio: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 6, maxWidth: 320 },
  photoBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', gap: 16 },
  photoFull: { width: 280, height: 280, borderRadius: 140 },
  photoName: { color: '#fff', fontSize: 20, fontWeight: '700' },
  stats: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  stat: { flex: 1, alignItems: 'center', gap: 1 },
  statCount: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, fontWeight: '600' },
  primary: {
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  noticeAction: { fontSize: 15, fontWeight: '700' },
  avatarRing: { padding: 3, borderRadius: 70 },
  avatarGap: { padding: 3, borderRadius: 66 },
  name: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginTop: Spacing.two, maxWidth: '90%' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' },
  presence: { fontSize: 13, fontWeight: '600' },
  flex: { flex: 1 },
  transparent: { backgroundColor: 'transparent' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.two },
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
