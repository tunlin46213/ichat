import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Accent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const HINT_AFTER_MS = 7000;

/**
 * Shown instead of a frozen splash while Firebase is still restoring the session.
 * On start-up it checks the saved login with Google's servers, and on a slow or
 * filtered mobile connection that request can hang for up to a minute.
 */
export function ConnectingScreen() {
  const theme = useTheme();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), HINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Animated.View entering={FadeIn} style={styles.center}>
        <View style={[styles.logo, { backgroundImage: `linear-gradient(135deg, ${Accent} 0%, #8E4EC6 100%)` }]}>
          <Icon name="bubble.left.and.bubble.right.fill" size={38} color="#fff" fallback="💬" />
        </View>
        <View style={styles.row}>
          <ActivityIndicator />
          <Text style={[styles.title, { color: theme.text }]}>Connecting…</Text>
        </View>
      </Animated.View>

      {slow ? (
        <Animated.View entering={FadeInDown.springify().damping(18)} style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Taking longer than usual</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            • Check that Mobile Data is allowed for iChat (Settings → Mobile Data → iChat).{'\n'}
            • Your network may be slow or blocking Google services. Try Wi-Fi or a VPN.{'\n'}
            • iChat keeps trying and opens by itself once it gets through.
          </Text>
          {Platform.OS === 'ios' ? (
            <Pressable
              onPress={() => Linking.openSettings().catch(() => {})}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}>
              <Icon name="gearshape.fill" size={16} color="#fff" fallback="⚙" />
              <Text style={styles.buttonText}>Open iChat Settings</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.five },
  center: { alignItems: 'center', gap: Spacing.three },
  logo: { width: 84, height: 84, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 17, fontWeight: '600' },
  card: { borderRadius: 18, padding: Spacing.three, gap: 10, maxWidth: 460, alignSelf: 'center', width: '100%' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardText: { fontSize: 14, lineHeight: 21 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
    backgroundColor: Accent,
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
