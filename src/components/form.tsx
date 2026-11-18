import { BlurView } from 'expo-blur';
import { Children, Fragment, useEffect, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { ScalePressable } from '@/components/scale-pressable';
import { Accent, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

const BACKDROP = {
  light: 'linear-gradient(160deg, #DCEBFF 0%, #EFE7FF 48%, #FFE6F1 100%)',
  dark: 'linear-gradient(160deg, #071630 0%, #120A26 52%, #24081A 100%)',
};
const LOGO_GRADIENT = `linear-gradient(135deg, ${Accent} 0%, #8E4EC6 100%)`;

/**
 * Keyboard-aware sign-in style screen: soft gradient backdrop with floating color
 * blobs, an animated app logo, title and subtitle, and the form on a frosted card.
 */
export function FormScreen({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <View style={[styles.flex, { backgroundColor: theme.groupedBackground, backgroundImage: BACKDROP[scheme] }]}>
      <Blob color={Accent} size={260} style={styles.blobA} />
      <Blob color="#D6409F" size={220} style={styles.blobB} delay={900} />
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive">
            <View style={styles.column}>
              <View style={styles.hero}>
                <Logo />
                <Animated.Text
                  entering={FadeInDown.delay(80).springify().damping(18)}
                  style={[styles.title, { color: theme.text }]}>
                  {title}
                </Animated.Text>
                {subtitle ? (
                  <Animated.Text
                    entering={FadeInDown.delay(140).springify().damping(18)}
                    style={[styles.subtitle, { color: theme.textSecondary }]}>
                    {subtitle}
                  </Animated.Text>
                ) : null}
              </View>
              <Animated.View entering={FadeInDown.delay(200).springify().damping(18)}>
                <BlurView
                  intensity={60}
                  tint={scheme === 'dark' ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
                  style={[
                    styles.glass,
                    {
                      backgroundColor: scheme === 'dark' ? 'rgba(28,28,30,0.55)' : 'rgba(255,255,255,0.55)',
                      borderColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)',
                    },
                  ]}>
                  {children}
                </BlurView>
              </Animated.View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** App logo that pops in, then gently floats (still when Reduce Motion is on). */
function Logo() {
  const reduceMotion = useReducedMotion();
  const float = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    float.set(withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduceMotion, float]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * float.get() }, { rotate: `${-4 + 8 * float.get()}deg` }],
  }));
  return (
    <Animated.View entering={ZoomIn.springify().damping(12)}>
      <Animated.View style={[styles.logo, { backgroundImage: LOGO_GRADIENT }, style]}>
        <Icon name="bubble.left.and.bubble.right.fill" size={40} color="#fff" fallback="💬" />
      </Animated.View>
    </Animated.View>
  );
}

/** Soft, slowly drifting color blob behind the form. */
function Blob({ color, size, style, delay = 0 }: {
  color: string;
  size: number;
  style: object;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    const t = setTimeout(
      () => drift.set(withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }), -1, true)),
      delay
    );
    return () => clearTimeout(t);
  }, [reduceMotion, drift, delay]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: 30 * drift.get() }, { translateY: -24 * drift.get() }, { scale: 1 + 0.12 * drift.get() }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.blob,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          // Soft edge without a blur filter (iOS doesn't support filter: blur).
          backgroundImage: `radial-gradient(circle, ${color}88 0%, ${color}00 70%)`,
        },
        style,
        animated,
      ]}
    />
  );
}

/** iOS-style inset group: fields share one rounded card, split by hairlines. */
export function FieldGroup({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const items = Children.toArray(children);
  return (
    <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.separator }]}>
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

/**
 * Text field row. `icon` adds a leading symbol that lights up while focused;
 * password fields (`secureTextEntry`) get an eye button to show what was typed.
 */
export function Field({ ref, icon, iconFallback = '', secureTextEntry, onFocus, onBlur, ...props }: TextInputProps & {
  ref?: Ref<FieldRef>;
  icon?: IconName;
  iconFallback?: string;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  return (
    <View style={styles.fieldRow}>
      {icon ? (
        <View style={styles.fieldIcon}>
          <Icon name={icon} size={17} color={focused ? Accent : theme.textSecondary} fallback={iconFallback} />
        </View>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={theme.textSecondary}
        secureTextEntry={secureTextEntry && hidden}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...props}
        style={[styles.input, icon && styles.inputWithIcon, { color: theme.text }, props.style]}
      />
      {secureTextEntry ? (
        <Pressable
          onPress={() => setHidden((h) => !h)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          style={styles.eye}>
          <Icon
            name={hidden ? 'eye' : 'eye.slash'}
            size={18}
            color={theme.textSecondary}
            fallback={hidden ? '👁' : '🙈'}
          />
        </Pressable>
      ) : null}
    </View>
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
      style={[styles.button, { backgroundImage: LOGO_GRADIENT, opacity: inactive ? 0.6 : 1 }]}>
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
  hero: { alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 26,
    backgroundColor: Accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
    boxShadow: '0 12px 30px rgba(32,138,239,0.45)',
  },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center' },
  glass: {
    borderRadius: 24,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
    overflow: 'hidden',
    boxShadow: '0 20px 50px rgba(0,0,0,0.12)',
  },
  blob: { position: 'absolute', opacity: 0.55 },
  blobA: { top: -60, left: -80 },
  blobB: { bottom: 40, right: -90 },
  group: { borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.three },
  fieldRow: { flexDirection: 'row', alignItems: 'center' },
  fieldIcon: { width: 22, marginLeft: 14, alignItems: 'center' },
  input: {
    flex: 1,
    fontSize: 17,
    paddingHorizontal: Spacing.three,
    minHeight: 50,
    paddingVertical: 12,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  inputWithIcon: { paddingLeft: 10 },
  eye: { paddingHorizontal: 14, minHeight: 50, justifyContent: 'center' },
  button: {
    backgroundColor: Accent,
    borderRadius: 16,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.one,
    boxShadow: '0 8px 20px rgba(32,138,239,0.35)',
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  error: { flex: 1, color: '#E5484D', fontSize: 14 },
});
