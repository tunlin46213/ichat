import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Icon } from '@/components/icon';
import { toast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { getBarkStatus, parseBarkKey, saveBark, testBark, type BarkStatus } from '@/lib/notify';

const BARK_APP_STORE = 'https://apps.apple.com/app/id1403753865';

/**
 * Lock-screen alerts through the free Bark app. A sideloaded iChat (free Apple ID) can't
 * receive Apple push itself, so the worker sends new messages and calls to Bark, and
 * tapping the alert opens the chat here.
 */
export default function NotificationsScreen() {
  const theme = useTheme();
  const [status, setStatus] = useState<BarkStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'off' | 'preview' | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBarkStatus().then(
      (s) => !cancelled && setStatus(s),
      () => !cancelled && setFailed(true)
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function paste() {
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (!text) return toast.info('The clipboard is empty. Copy the link in Bark first.');
    setInput(text.trim());
  }

  async function save() {
    const key = parseBarkKey(input);
    if (!key) {
      haptics.error();
      return toast.error('That doesn’t look like a Bark link. Copy it again from the Bark app.');
    }
    setBusy('save');
    try {
      const res = await saveBark({ key });
      setStatus((s) => ({ available: true, enabled: res.enabled, preview: res.preview ?? s?.preview ?? false }));
      setInput('');
      haptics.success();
      // Straight away, so they can see it works.
      await testBark().catch(() => {});
      toast.success('Bark connected — check for a test alert', 'bell.fill');
    } catch {
      toast.error('Could not save. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy('test');
    try {
      await testBark();
      toast.success('Test alert sent', 'bell.fill');
    } catch {
      toast.error('The test alert failed. Copy the link from Bark and connect again.');
    } finally {
      setBusy(null);
    }
  }

  async function setPreview(preview: boolean) {
    setBusy('preview');
    setStatus((s) => (s ? { ...s, preview } : s));
    try {
      await saveBark({ preview });
    } catch {
      setStatus((s) => (s ? { ...s, preview: !preview } : s));
      toast.error('Could not change it. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function turnOff() {
    setBusy('off');
    try {
      await saveBark({ key: null });
      setStatus((s) => (s ? { ...s, enabled: false } : s));
      toast.success('Lock-screen alerts turned off', 'bell.slash.fill');
    } catch {
      toast.error('Could not turn it off. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const card = [styles.card, { backgroundColor: theme.card }];

  return (
    <ScrollView
      style={{ backgroundColor: theme.groupedBackground }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={[styles.heroIcon, { backgroundColor: '#FF3B30' }]}>
          <Icon name="bell.badge.fill" size={30} color="#fff" fallback="🔔" />
        </View>
        <Text style={[styles.heroTitle, { color: theme.text }]}>Alerts when iChat is closed</Text>
        <Text style={[styles.heroText, { color: theme.textSecondary }]}>
          New messages and calls show on your lock screen through the free Bark app. Tap one to open the chat.
        </Text>
      </View>

      {!status && !failed ? (
        <ActivityIndicator style={styles.loading} />
      ) : failed || status?.available === false ? (
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          {failed
            ? 'Could not reach the notification server. Check your connection and open this page again.'
            : 'Lock-screen alerts are not set up on the server yet.'}
        </Text>
      ) : status?.enabled ? (
        <>
          <View style={card}>
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: '#34C759' }]} />
              <Text style={[styles.rowText, { color: theme.text }]}>Connected to Bark</Text>
            </View>
            <View style={[styles.row, styles.rowBorder, { borderTopColor: theme.separator }]}>
              <Text style={[styles.rowText, { color: theme.text }]}>Show message text</Text>
              <Switch
                value={status.preview}
                onValueChange={setPreview}
                disabled={busy === 'preview'}
                trackColor={{ true: theme.accent }}
              />
            </View>
          </View>
          <Text style={[styles.footer, { color: theme.textSecondary }]}>
            Off: alerts say “New message” (photos, voice and calls still say what they are). Alerts pass through
            Bark’s server, so leave this off for private chats.
          </Text>

          <View style={card}>
            <Action label="Send Test Alert" busy={busy === 'test'} onPress={sendTest} />
            <Action label="Turn Off" busy={busy === 'off'} onPress={turnOff} destructive border />
          </View>
          <Text style={[styles.footer, { color: theme.textSecondary }]}>
            Calls ring for about 30 seconds. To hear them in Focus or Do Not Disturb, allow Time Sensitive
            notifications for Bark in iPhone Settings → Notifications → Bark.
          </Text>
        </>
      ) : (
        <>
          <View style={card}>
            <Step n={1} text="Install Bark from the App Store (free) and allow its notifications.">
              <Pressable onPress={() => Linking.openURL(BARK_APP_STORE).catch(() => {})} hitSlop={6}>
                <Text style={[styles.link, { color: theme.accent }]}>Open App Store</Text>
              </Pressable>
            </Step>
            <Step n={2} text="In Bark, copy your link from the top of the home screen (https://api.day.app/…)." border />
            <Step n={3} text="Paste it here and tap Connect." border />
          </View>

          <View style={[card, styles.inputCard]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="https://api.day.app/…"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={save}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <View style={styles.buttons}>
              <Pressable
                onPress={paste}
                accessibilityRole="button"
                style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.buttonText, { color: theme.accent }]}>Paste</Text>
              </Pressable>
              <Pressable
                onPress={save}
                disabled={busy === 'save' || !input.trim()}
                accessibilityRole="button"
                style={[styles.button, styles.flex, { backgroundColor: theme.accent, opacity: input.trim() ? 1 : 0.5 }]}>
                {busy === 'save' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.buttonText, { color: '#fff' }]}>Connect</Text>
                )}
              </Pressable>
            </View>
          </View>
          <Text style={[styles.footer, { color: theme.textSecondary }]}>
            Your Bark link is kept on the iChat server only — the people you chat with never see it.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function Step({ n, text, border, children }: { n: number; text: string; border?: boolean; children?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.step, border && [styles.rowBorder, { borderTopColor: theme.separator }]]}>
      <View style={[styles.stepNum, { backgroundColor: `${theme.accent}22` }]}>
        <Text style={[styles.stepNumText, { color: theme.accent }]}>{n}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={[styles.stepText, { color: theme.text }]}>{text}</Text>
        {children}
      </View>
    </View>
  );
}

function Action({ label, busy, onPress, destructive, border }: {
  label: string;
  busy: boolean;
  onPress: () => void;
  destructive?: boolean;
  border?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        border && [styles.rowBorder, { borderTopColor: theme.separator }],
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <Text style={[styles.rowText, { color: destructive ? '#FF3B30' : theme.accent }]}>{label}</Text>
      {busy ? <ActivityIndicator /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  hero: { alignItems: 'center', gap: 8, paddingVertical: Spacing.three },
  heroIcon: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  heroText: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 340 },
  loading: { marginTop: Spacing.four },
  note: { fontSize: 15, textAlign: 'center', marginTop: Spacing.three },
  card: { borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: Spacing.three },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, fontSize: 17 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  footer: { fontSize: 13, lineHeight: 18, marginHorizontal: Spacing.three, marginBottom: Spacing.two },
  step: { flexDirection: 'row', gap: 12, padding: Spacing.three },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 14, fontWeight: '800' },
  stepText: { fontSize: 15, lineHeight: 21 },
  link: { fontSize: 15, fontWeight: '600', marginTop: 6 },
  inputCard: { padding: Spacing.three, gap: 10 },
  input: {
    fontSize: 16,
    height: 46,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  buttons: { flexDirection: 'row', gap: 10 },
  button: { height: 46, paddingHorizontal: 18, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
});
