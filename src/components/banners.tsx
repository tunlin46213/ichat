import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNetInfo } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Spacing } from '@/constants/theme';
import { authErrorMessage, useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { getWebPushState } from '@/lib/push';
import { updateRequired, useRemoteConfig } from '@/lib/remote-config';

/**
 * iPhone Safari only: explains how to install the web app, which is required for
 * push notifications on iOS. Dismissal is remembered on this device.
 */
export function InstallBanner() {
  const theme = useTheme();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('ichat.installBanner') === 'dismissed';
    } catch {
      return false;
    }
  });
  if (Platform.OS !== 'web' || dismissed || getWebPushState() !== 'needs-install') return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem('ichat.installBanner', 'dismissed');
    } catch {
      // private mode: just hide for this session
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.cardRow}>
        <Icon name="bell.fill" size={16} color={theme.accent} fallback="🔔" />
        <Text style={[styles.cardTitle, { color: theme.text }]}>Install iChat</Text>
      </View>
      <Text style={[styles.cardText, { color: theme.textSecondary }]}>
        Tap the Share button, then &quot;Add to Home Screen&quot;. Open iChat from your Home
        Screen to get message notifications.
      </Text>
      <View style={styles.cardActions}>
        <Pressable onPress={dismiss} hitSlop={8}>
          <Text style={[styles.action, { color: theme.accent }]}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** "No connection" strip. Firestore keeps queued messages and sends them when back online. */
export function OfflineBanner() {
  const net = useNetInfo();
  // isInternetReachable is null while unknown; only warn when we know we're offline.
  const offline = net.isConnected === false || net.isInternetReachable === false;
  if (!offline) return null;
  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(200)}
      accessibilityRole="alert"
      style={[styles.bar, { backgroundColor: '#FF9500' }]}>
      <Icon name="exclamationmark.circle.fill" size={15} color="#fff" fallback="!" />
      <Text style={styles.barText}>No connection. Messages will send when you&apos;re back online.</Text>
    </Animated.View>
  );
}

/** Asks unverified users to confirm their email, with resend and "I've verified" actions. */
export function VerifyEmailBanner() {
  const { user, emailVerified, resendVerification, refreshUser } = useAuth();
  const theme = useTheme();
  const [note, setNote] = useState<string | null>(null);
  if (!user || emailVerified) return null;

  async function resend() {
    try {
      await resendVerification();
      haptics.success();
      setNote('Sent! Check your inbox.');
    } catch (err) {
      haptics.error();
      setNote(authErrorMessage(err));
    }
  }

  async function check() {
    await refreshUser().catch(() => {});
    setNote(NOT_VERIFIED_YET);
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.cardRow}>
        <Icon name="exclamationmark.circle.fill" size={18} color={theme.accent} fallback="!" />
        <Text style={[styles.cardTitle, { color: theme.text }]}>Verify your email</Text>
      </View>
      <Text style={[styles.cardText, { color: theme.textSecondary }]}>
        We sent a link to {user.email}. Verifying keeps your account secure and lets you reset
        your password.
      </Text>
      {note ? <Text style={[styles.cardText, { color: theme.textSecondary }]}>{note}</Text> : null}
      <View style={styles.cardActions}>
        <Pressable onPress={resend} hitSlop={8}>
          <Text style={[styles.action, { color: theme.accent }]}>Resend email</Text>
        </Pressable>
        <Pressable onPress={check} hitSlop={8}>
          <Text style={[styles.action, { color: theme.accent }]}>I&apos;ve verified</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** This build is older than config/app.minBuildTime: ask for the new one. */
export function UpdateBanner() {
  const theme = useTheme();
  const config = useRemoteConfig();
  if (Platform.OS === 'web' || !updateRequired(config)) return null;
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.accent, borderWidth: 1 }]}>
      <View style={styles.cardRow}>
        <Icon name="arrow.down.circle.fill" size={18} color={theme.accent} fallback="⬇" />
        <Text style={[styles.cardTitle, { color: theme.text }]}>Update iChat</Text>
      </View>
      <Text style={[styles.cardText, { color: theme.textSecondary }]}>
        {config.updateMessage ??
          'A newer version of iChat is ready. Install the latest build so messages, calls and alerts keep working.'}
      </Text>
    </View>
  );
}

const BG_ALERTS_KEY = 'ichat.bgAlertsBanner';

/** Opens Android's battery-optimization list (falls back to iChat's app settings). */
export function openBatterySettings() {
  Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').catch(() =>
    Linking.openSettings().catch(() => {})
  );
}

/**
 * Android only, until dismissed: many phones (Xiaomi, Oppo, Vivo, Samsung…) stop apps in
 * the background, and then message / call alerts never arrive.
 */
export function BackgroundAlertsBanner() {
  const theme = useTheme();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelled = false;
    AsyncStorage.getItem(BG_ALERTS_KEY).then(
      (v) => !cancelled && setShow(v !== 'done'),
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, []);
  if (!show) return null;

  function done() {
    setShow(false);
    AsyncStorage.setItem(BG_ALERTS_KEY, 'done').catch(() => {});
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.cardRow}>
        <Icon name="bell.badge.fill" size={18} color={theme.accent} fallback="🔔" />
        <Text style={[styles.cardTitle, { color: theme.text }]}>Get alerts when iChat is closed</Text>
      </View>
      <Text style={[styles.cardText, { color: theme.textSecondary }]}>
        Some phones stop apps in the background. Set Battery to “Unrestricted” (and turn on Autostart if your
        phone has it) so messages and calls always come through.
      </Text>
      <View style={styles.cardActions}>
        <Pressable onPress={openBatterySettings} hitSlop={8}>
          <Text style={[styles.action, { color: theme.accent }]}>Battery</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openSettings().catch(() => {})} hitSlop={8}>
          <Text style={[styles.action, { color: theme.accent }]}>App settings</Text>
        </Pressable>
        <Pressable onPress={done} hitSlop={8}>
          <Text style={[styles.action, { color: theme.textSecondary }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const NOT_VERIFIED_YET = 'Not verified yet. Open the link in the email, then try again.';

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  barText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '500' },
  card: {
    marginHorizontal: Spacing.three,
    marginVertical: Spacing.two,
    padding: Spacing.three,
    borderRadius: 14,
    gap: 6,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardText: { fontSize: 14, lineHeight: 19 },
  cardActions: { flexDirection: 'row', gap: Spacing.four, marginTop: 4 },
  action: { fontSize: 15, fontWeight: '600' },
});
