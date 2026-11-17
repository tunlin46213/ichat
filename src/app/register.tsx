import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ErrorText, Field, FieldGroup, FormScreen, PrimaryButton, type FieldRef } from '@/components/form';
import { Accent } from '@/constants/theme';
import { authErrorMessage, useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

export default function RegisterScreen() {
  const { register } = useAuth();
  const theme = useTheme();
  const emailRef = useRef<FieldRef>(null);
  const passwordRef = useRef<FieldRef>(null);
  const confirmRef = useRef<FieldRef>(null);
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
      haptics.success();
    } catch (err) {
      haptics.error();
      setError(authErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <FormScreen title="Create Account" subtitle="Your name is what friends will see">
      <FieldGroup>
        <Field
          value={name}
          onChangeText={setName}
          placeholder="Name"
          autoComplete="name"
          textContentType="name"
          maxLength={40}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <Field
          ref={emailRef}
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
      </FieldGroup>
      <FieldGroup>
        <Field
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          placeholder="Password (6+ characters)"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <Field
          ref={confirmRef}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm password"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />
      </FieldGroup>
      <ErrorText message={error} />
      <PrimaryButton title="Create Account" onPress={onSubmit} loading={loading} />
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
