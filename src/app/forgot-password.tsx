import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ErrorText, Field, FieldGroup, FormScreen, PrimaryButton } from '@/components/form';
import { Icon } from '@/components/icon';
import { Accent } from '@/constants/theme';
import { authErrorMessage, useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

export default function ForgotPasswordScreen() {
  const { sendPasswordReset } = useAuth();
  const theme = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit() {
    if (!email.trim()) return setError('Enter your email address.');
    setError(null);
    setLoading(true);
    try {
      await sendPasswordReset(email);
      haptics.success();
      setSentTo(email.trim());
    } catch (err) {
      haptics.error();
      // Don't reveal whether an account exists for this email.
      const code = (err as { code?: string }).code;
      if (code === 'auth/user-not-found') setSentTo(email.trim());
      else setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/login'));

  if (sentTo) {
    return (
      <FormScreen title="Check your email" subtitle={`If an account exists for ${sentTo}, we sent a link to reset your password.`}>
        <Animated.View entering={FadeIn} style={styles.sent}>
          <Icon name="checkmark.circle.fill" size={56} color="#34C759" fallback="✓" />
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Open the link, choose a new password, then log in. Check your spam folder if you
            don&apos;t see it within a few minutes.
          </Text>
        </Animated.View>
        <PrimaryButton title="Back to Log In" onPress={back} />
      </FormScreen>
    );
  }

  return (
    <FormScreen title="Reset Password" subtitle="Enter the email you signed up with">
      <FieldGroup>
        <Field
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="send"
          autoFocus
          onSubmitEditing={onSubmit}
        />
      </FieldGroup>
      <ErrorText message={error} />
      <PrimaryButton title="Send Reset Link" onPress={onSubmit} loading={loading} />
      <View style={styles.footer}>
        <Pressable onPress={back} hitSlop={8}>
          <Text style={styles.link}>Back to Log In</Text>
        </Pressable>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  sent: { alignItems: 'center', gap: 12, marginBottom: 8 },
  hint: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  footer: { alignItems: 'center', marginTop: 8 },
  link: { color: Accent, fontSize: 15, fontWeight: '600' },
});
