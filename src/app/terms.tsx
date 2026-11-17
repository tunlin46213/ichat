import { ScrollView, StyleSheet, Text } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Plain-language terms. Apple requires apps with user-generated content to show terms
// that forbid objectionable content and abusive users (App Review Guideline 1.2).
// Have this reviewed before publishing, and keep it in sync with your privacy policy.
const SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. Using iChat',
    body: 'iChat lets you send messages to other people. You must be at least 13 years old (or the minimum age in your country) to use it. You are responsible for what you send.',
  },
  {
    title: '2. Zero tolerance for abuse',
    body: 'Do not send content that is illegal, hateful, harassing, threatening, sexually explicit, violent, or that impersonates someone else. Do not spam or scam other users. There is no tolerance for objectionable content or abusive users.',
  },
  {
    title: '3. Reporting and blocking',
    body: 'You can block anyone so they can no longer message you, and report messages or people who break these rules. Reports are reviewed within 24 hours. We remove offending content and ban users who violate these terms.',
  },
  {
    title: '4. Your data',
    body: 'We store your name, email, and messages to run the service. Your email is never shown to other users. Only the people in a chat can read its messages. You can delete your account at any time in Settings.',
  },
  {
    title: '5. Changes',
    body: 'We may update these terms. If we make important changes, we will let you know in the app.',
  },
];

export default function TermsScreen() {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: theme.groupedBackground }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <Text style={[styles.updated, { color: theme.textSecondary }]}>Last updated: November 2026</Text>
      {SECTIONS.map((s) => (
        <Text key={s.title} style={[styles.body, { color: theme.text }]}>
          <Text style={styles.title}>{`${s.title}\n`}</Text>
          {s.body}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  updated: { fontSize: 13 },
  title: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23 },
});
