import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ErrorText, Field, FieldGroup, FormScreen, PrimaryButton, type FieldRef } from '@/components/form';
import { Accent } from '@/constants/theme';
import { authErrorMessage, useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const theme = useTheme();
  const passwordRef = useRef<FieldRef>(null);
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
      // On success the root layout's guard switches to the chats screen.
    } catch (err) {
      haptics.error();
      setError(authErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <FormScreen title="Welcome to iChat" subtitle="Log in to continue chatting">
      <FieldGroup>
        <Field
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <Field
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />
      </FieldGroup>
      <Link
        href={{ pathname: '/forgot-password', params: email.trim() ? { email: email.trim() } : {} }}
        style={styles.forgot}>
        Forgot password?
      </Link>
      <ErrorText message={error} />
      <PrimaryButton title="Log In" onPress={onSubmit} loading={loading} />
      <Text style={[styles.footer, { color: theme.textSecondary }]}>
        New to iChat?{' '}
        <Link href="/register" replace style={styles.link}>
          Create an account
        </Link>
      </Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  footer: { textAlign: 'center', fontSize: 15, marginTop: 8 },
  link: { color: Accent, fontWeight: '600' },
  forgot: { color: Accent, fontSize: 15, alignSelf: 'flex-end', marginTop: -4 },
});
