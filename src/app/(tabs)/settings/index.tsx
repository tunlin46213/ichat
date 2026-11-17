import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon, type IconName } from '@/components/icon';
import { LargeTitleHeader } from '@/components/web-header';
import { Spacing } from '@/constants/theme';
import { authErrorMessage, useAuth } from '@/context/auth';
import { useBlocks } from '@/context/blocks';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfile } from '@/hooks/use-user-profile';
import { confirmDestructive } from '@/lib/confirm';
import { haptics } from '@/lib/haptics';
import { mediaErrorMessage, pickImage, updateAvatar } from '@/lib/media';
import { enableWebPush, getWebPushState, type WebPushState } from '@/lib/push';

/** Text prompt: native iOS alert with a field, or the browser prompt on web. */
function promptText(opts: {
  title: string;
  message: string;
  defaultValue?: string;
  secure?: boolean;
  confirmLabel: string;
  onSubmit: (value: string) => void;
}) {
  if (Platform.OS === 'web') {
    const value = window.prompt(`${opts.title}\n\n${opts.message}`, opts.defaultValue ?? '');
    if (value != null) opts.onSubmit(value);
    return;
  }
  Alert.prompt(
    opts.title,
    opts.message,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: opts.confirmLabel, onPress: (value?: string) => opts.onSubmit(value ?? '') },
    ],
    opts.secure ? 'secure-text' : 'plain-text',
    opts.defaultValue
  );
}

function showError(err: unknown) {
  haptics.error();
  const message = authErrorMessage(err);
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert('Something went wrong', message);
}

export default function SettingsScreen() {
  const { user, displayName, logout, updateName, deleteAccount } = useAuth();
  const { blocked } = useBlocks();
  const myProfile = useUserProfile(user?.uid);
  const [pushState, setPushState] = useState<WebPushState>(() => getWebPushState());

  // Must run from a tap: iOS only shows the permission prompt for a user gesture.
  async function turnOnPush() {
    try {
      const state = await enableWebPush(user!.uid);
      setPushState(state);
      if (state === 'on') haptics.success();
    } catch {
      haptics.error();
      setPushState(getWebPushState());
    }
  }
  const [uploading, setUploading] = useState(false);

  async function changePhoto(source: 'library' | 'camera') {
    try {
      // Small (256px) so it fits on the profile doc and loads instantly everywhere.
      const image = await pickImage(source, 256);
      if (!image) return;
      setUploading(true);
      await updateAvatar(user!.uid, image);
      haptics.success();
    } catch (err) {
      haptics.error();
      const message = mediaErrorMessage(err);
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Photo not updated', message);
    } finally {
      setUploading(false);
    }
  }

  function photoOptions() {
    if (Platform.OS === 'web') return changePhoto('library');
    Alert.alert('Profile Photo', undefined, [
      { text: 'Take Photo', onPress: () => changePhoto('camera') },
      { text: 'Choose from Library', onPress: () => changePhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
  const theme = useTheme();
  const name = displayName ?? 'You';

  function editName() {
    promptText({
      title: 'Your Name',
      message: 'This is the name your friends see.',
      defaultValue: name,
      confirmLabel: 'Save',
      onSubmit: (value) => {
        const clean = value.trim();
        if (!clean || clean === name) return;
        if (clean.length > 40) return showError({ code: 'name-too-long' });
        updateName(clean).then(() => haptics.success(), showError);
      },
    });
  }

  function confirmLogout() {
    haptics.warning();
    confirmDestructive({
      title: 'Log out?',
      message: 'You can log back in with your email and password.',
      confirmLabel: 'Log Out',
      onConfirm: () => logout(),
    });
  }

  function confirmDeleteAccount() {
    haptics.warning();
    confirmDestructive({
      title: 'Delete account?',
      message:
        'Your profile will be permanently removed and you will be signed out. This cannot be undone.',
      confirmLabel: 'Continue',
      onConfirm: () =>
        promptText({
          title: 'Confirm with password',
          message: 'Enter your password to permanently delete your account.',
          secure: true,
          confirmLabel: 'Delete',
          onSubmit: (password) => {
            if (!password) return;
            deleteAccount(password).catch(showError);
          },
        }),
    });
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.groupedBackground }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      {Platform.OS === 'web' ? (
        <View style={styles.webHeader}>
          <LargeTitleHeader title="Settings" />
        </View>
      ) : null}

      <Pressable
        onPress={editName}
        accessibilityRole="button"
        accessibilityHint="Edit your name"
        style={({ pressed }) => [
          styles.card,
          styles.profile,
          { backgroundColor: pressed ? theme.backgroundSelected : theme.card },
        ]}>
        <Pressable onPress={photoOptions} accessibilityLabel="Change profile photo" hitSlop={4}>
          <Avatar id={user!.uid} name={name} size={64} uri={myProfile?.avatarUrl} />
          <View style={[styles.cameraBadge, { borderColor: theme.card }]}>
            {uploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Icon name="camera.fill" size={11} color="#fff" fallback="+" />
            )}
          </View>
        </Pressable>
        <View style={styles.profileText}>
          <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.profileEmail, { color: theme.textSecondary }]} numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
        <Icon name="chevron.right" size={14} color={theme.textSecondary} fallback="" />
      </Pressable>

      <Section title="PROFILE">
        <Row icon="pencil" iconBg="#007AFF" label="Edit Name" value={name} onPress={editName} />
        <Row icon="camera.fill" iconBg="#FF9500" label="Change Photo" onPress={photoOptions} />
      </Section>

      {Platform.OS === 'web' ? (
        <Section
          title="NOTIFICATIONS"
          footer={
            pushState === 'needs-install'
              ? 'On iPhone, add iChat to your Home Screen (Share → Add to Home Screen) and open it from there to turn on notifications.'
              : pushState === 'denied'
                ? 'Notifications are blocked. Allow them for this site in your browser or iPhone Settings.'
                : pushState === 'unsupported'
                  ? 'Notifications are not available in this browser or are not set up yet.'
                  : undefined
          }>
          <Row
            icon="bell.fill"
            iconBg="#FF3B30"
            label="Message Notifications"
            value={
              pushState === 'on' ? 'On' : pushState === 'off' ? 'Off' : pushState === 'denied' ? 'Blocked' : 'Unavailable'
            }
            onPress={pushState === 'off' ? turnOnPush : undefined}
          />
        </Section>
      ) : null}

      <Section title="PRIVACY & SECURITY" footer="Only people in a chat can read its messages. Your email is never shown to other users.">
        <Row
          icon="hand.raised.fill"
          iconBg="#FF3B30"
          label="Blocked Users"
          value={blocked.length ? String(blocked.length) : undefined}
          onPress={() => router.push('/settings/blocked' as Href)}
        />
        <Row
          icon="doc.text"
          iconBg="#8E8E93"
          label="Terms of Use"
          onPress={() => router.push('/terms')}
        />
      </Section>

      <Section title="ACCOUNT">
        <Row
          icon="rectangle.portrait.and.arrow.right"
          iconBg="#8E8E93"
          label="Log Out"
          onPress={confirmLogout}
        />
        <Row
          icon="person.crop.circle.badge.xmark"
          iconBg="#FF3B30"
          label="Delete Account"
          destructive
          onPress={confirmDeleteAccount}
        />
      </Section>

      <Text style={[styles.footer, { color: theme.textSecondary }]}>
        iChat {Constants.expoConfig?.version ?? ''}
      </Text>
    </ScrollView>
  );
}

function Section({ title, footer, children }: {
  title: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View>
      <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: theme.card }]}>{children}</View>
      {footer ? (
        <Text style={[styles.sectionFooter, { color: theme.textSecondary }]}>{footer}</Text>
      ) : null}
    </View>
  );
}

function Row({ icon, iconBg, label, value, destructive, onPress }: {
  icon: IconName;
  iconBg: string;
  label: string;
  value?: string;
  destructive?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      style={({ pressed }) => [styles.cell, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.cellIcon, { backgroundColor: iconBg }]}>
        <Icon name={icon} size={15} color="#fff" fallback="•" />
      </View>
      <View style={[styles.cellBody, { borderBottomColor: theme.separator }]}>
        <Text
          style={[styles.cellText, { color: destructive ? '#FF3B30' : theme.text }]}
          numberOfLines={1}>
          {label}
        </Text>
        {value ? (
          <Text style={[styles.cellValue, { color: theme.textSecondary }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {onPress && !destructive ? (
          <Icon name="chevron.right" size={13} color={theme.textSecondary} fallback="" />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  // LargeTitleHeader has its own side padding; cancel the list's so titles line up.
  webHeader: { marginHorizontal: -Spacing.three, marginTop: -Spacing.three },
  card: { borderRadius: 12, overflow: 'hidden' },
  profile: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, gap: 14 },
  profileText: { flex: 1, gap: 2 },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: { fontSize: 22, fontWeight: '600' },
  profileEmail: { fontSize: 15 },
  sectionHeader: { fontSize: 13, marginTop: Spacing.three, marginBottom: 6, marginLeft: Spacing.three },
  sectionFooter: { fontSize: 13, lineHeight: 18, marginTop: 6, marginHorizontal: Spacing.three },
  cell: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.three, gap: 12 },
  cellIcon: {
    width: 29,
    height: 29,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    paddingRight: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cellText: { flex: 1, fontSize: 17 },
  cellValue: { fontSize: 17, maxWidth: 160 },
  footer: { textAlign: 'center', fontSize: 13, marginTop: Spacing.four },
});
