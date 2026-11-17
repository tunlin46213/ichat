import Constants from 'expo-constants';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { LargeTitleHeader } from '@/components/web-header';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { haptics } from '@/lib/haptics';

export default function SettingsScreen() {
  const { user, displayName, logout } = useAuth();
  const theme = useTheme();
  const name = displayName ?? 'You';

  function confirmLogout() {
    haptics.warning();
    confirmDestructive({
      title: 'Log out?',
      message: 'You can log back in with your email and password.',
      confirmLabel: 'Log Out',
      onConfirm: () => logout(),
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
      <View style={[styles.card, styles.profile, { backgroundColor: theme.card }]}>
        <Avatar id={user!.uid} name={name} size={64} />
        <View style={styles.profileText}>
          <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.profileEmail, { color: theme.textSecondary }]} numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>ACCOUNT</Text>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Pressable
          onPress={confirmLogout}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.cell,
            pressed && { backgroundColor: theme.backgroundSelected },
          ]}>
          <View style={[styles.cellIcon, { backgroundColor: '#E5484D' }]}>
            <Icon name="rectangle.portrait.and.arrow.right" size={15} color="#fff" fallback="⎋" />
          </View>
          <Text style={[styles.cellText, { color: '#E5484D' }]}>Log Out</Text>
        </Pressable>
      </View>

      <Text style={[styles.footer, { color: theme.textSecondary }]}>
        iChat {Constants.expoConfig?.version ?? ''}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two },
  // LargeTitleHeader has its own side padding; cancel the list's so titles line up.
  webHeader: { marginHorizontal: -Spacing.three, marginTop: -Spacing.three },
  card: { borderRadius: 12, overflow: 'hidden' },
  profile: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, gap: 14 },
  profileText: { flex: 1, gap: 2 },
  profileName: { fontSize: 22, fontWeight: '600' },
  profileEmail: { fontSize: 15 },
  sectionHeader: { fontSize: 13, marginTop: Spacing.three, marginLeft: Spacing.three },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
  },
  cellIcon: {
    width: 29,
    height: 29,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 17 },
  footer: { textAlign: 'center', fontSize: 13, marginTop: Spacing.four },
});
