import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ErrorText, Field, FormScreen, PrimaryButton } from '@/components/form';
import { Accent } from '@/constants/theme';
import { authErrorMessage, useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      // On success the root layout's guard switches to the home screen.
    } catch (err) {
      setError(authErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <FormScreen title="iChat" subtitle="Log in to continue">
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      <ErrorText message={error} />
      <PrimaryButton title="Log in" onPress={onSubmit} loading={loading} />
      <Text style={[styles.footer, { color: theme.textSecondary }]}>
        No account?{' '}
        <Link href="/register" replace style={styles.link}>
          Register
        </Link>
      </Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  footer: { textAlign: 'center', fontSize: 15, marginTop: 8 },
  link: { color: Accent, fontWeight: '600' },
});
