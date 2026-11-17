import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ErrorText, Field, FormScreen, PrimaryButton } from '@/components/form';
import { Accent } from '@/constants/theme';
import { authErrorMessage, useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

export default function RegisterScreen() {
  const { register } = useAuth();
  const theme = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!name.trim()) return setError('Enter your name.');
    if (!email.trim()) return setError('Enter your email.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setError(null);
    setLoading(true);
    try {
      await register(name, email, password);
    } catch (err) {
      setError(authErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <FormScreen title="Create account" subtitle="Others will see your name">
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        autoComplete="name"
        textContentType="name"
        maxLength={40}
      />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 6 characters"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Field
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Type it again"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      <ErrorText message={error} />
      <PrimaryButton title="Register" onPress={onSubmit} loading={loading} />
      <Text style={[styles.footer, { color: theme.textSecondary }]}>
        Already have an account?{' '}
        <Link href="/login" replace style={styles.link}>
          Log in
        </Link>
      </Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  footer: { textAlign: 'center', fontSize: 15, marginTop: 8 },
  link: { color: Accent, fontWeight: '600' },
});
