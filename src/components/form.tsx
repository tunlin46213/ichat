import { Children, Fragment, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, { withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ScalePressable } from '@/components/scale-pressable';
import { Accent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Keyboard-aware screen with the app logo, title and subtitle on top. */
export function FormScreen({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.groupedBackground }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive">
          <View style={styles.column}>
            <View style={styles.hero}>
              <View style={styles.logo}>
                <Icon
                  name="bubble.left.and.bubble.right.fill"
                  size={40}
                  color="#fff"
                  fallback="💬"
                />
              </View>
              <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
              {subtitle ? (
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
              ) : null}
            </View>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** iOS-style inset group: fields share one rounded card, split by hairlines. */
export function FieldGroup({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const items = Children.toArray(children);
  return (
    <View style={[styles.group, { backgroundColor: theme.card }]}>
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: theme.separator }]} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

export type FieldRef = ComponentRef<typeof TextInput>;

export function Field({ ref, ...props }: TextInputProps & { ref?: Ref<FieldRef> }) {
  const theme = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[styles.input, { color: theme.text }, props.style]}
    />
  );
}

export function PrimaryButton({ title, onPress, loading, disabled }: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const inactive = loading || disabled;
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={[styles.button, { opacity: inactive ? 0.6 : 1 }]}>
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </ScalePressable>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    // key: replays the shake each time the message changes
    <Animated.View key={message} entering={Shake} style={styles.errorBox}>
      <Icon name="exclamationmark.circle.fill" size={16} color="#E5484D" fallback="!" />
      <Text style={styles.error}>{message}</Text>
    </Animated.View>
  );
}

/** Short horizontal shake, like iOS rejecting a wrong password. */
function Shake() {
  'worklet';
  return {
    initialValues: { transform: [{ translateX: 0 }] },
    animations: {
      transform: [
        {
          translateX: withSequence(
            withTiming(-8, { duration: 50 }),
            withTiming(8, { duration: 50 }),
            withTiming(-6, { duration: 50 }),
            withTiming(6, { duration: 50 }),
            withTiming(0, { duration: 50 })
          ),
        },
      ],
    },
  };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four },
  column: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: Spacing.three },
  hero: { alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.three },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: Accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: { fontSize: 30, fontWeight: '700' },
  subtitle: { fontSize: 16, textAlign: 'center' },
  group: { borderRadius: 12, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.three },
  input: {
    fontSize: 17,
    paddingHorizontal: Spacing.three,
    minHeight: 50,
    paddingVertical: 12,
  },
  button: {
    backgroundColor: Accent,
    borderRadius: 14,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  error: { flex: 1, color: '#E5484D', fontSize: 14 },
});
