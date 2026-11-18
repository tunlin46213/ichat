import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInRight, SlideOutLeft, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/action-sheet';
import { Avatar } from '@/components/avatar';
import { Icon, type IconName } from '@/components/icon';
import { ScalePressable } from '@/components/scale-pressable';
import { Accent, Spacing } from '@/constants/theme';
import { authErrorMessage, useAuth } from '@/context/auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfile } from '@/hooks/use-user-profile';
import { haptics } from '@/lib/haptics';
import { mediaErrorMessage, pickImage, updateAvatar } from '@/lib/media';

const STEPS = 3;
const GRADIENT = `linear-gradient(135deg, ${Accent} 0%, #8E4EC6 100%)`;
const BACKDROP = {
  light: 'linear-gradient(180deg, #E4EFFF 0%, #F6F1FF 55%, #FFFFFF 100%)',
  dark: 'linear-gradient(180deg, #0A1830 0%, #0E0A1E 55%, #000000 100%)',
};

const TIPS: { icon: IconName; fallback: string; title: string; text: string }[] = [
  { icon: 'arrowshape.turn.up.left', fallback: '↩', title: 'Swipe to reply', text: 'Drag a message to the right.' },
  { icon: 'star.fill', fallback: '❤️', title: 'Double-tap to ❤️', text: 'Or hold a message for more reactions.' },
  { icon: 'mic.fill', fallback: '🎤', title: 'Hold to record', text: 'Hold the mic, let go to send, slide left to cancel.' },
  { icon: 'paintbrush.fill', fallback: '🎨', title: 'Make it yours', text: 'Tap a name in a chat to pick its own theme.' },
];

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/** Three welcome steps after sign-up: profile photo, name, quick tips. */
export default function OnboardingScreen() {
  const { user, displayName, updateName, finishOnboarding } = useAuth();
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const uid = user!.uid;
  const profile = useUserProfile(uid);
  const [step, setStep] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [uploading, setUploading] = useState(false);
  // null until edited: right after sign-up the display name can arrive a moment later.
  const [typed, setTyped] = useState<string | null>(null);
  const name = typed ?? profile?.name ?? displayName ?? '';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownName = profile?.name ?? displayName ?? name;

  function next() {
    haptics.light();
    setError(null);
    if (step < STEPS - 1) setStep(step + 1);
    else finish();
  }
  function finish() {
    haptics.success();
    finishOnboarding();
  }

  async function choosePhoto(source: 'library' | 'camera') {
    try {
      const image = await pickImage(source, 256);
      if (!image) return;
      setUploading(true);
      await updateAvatar(uid, image);
      haptics.success();
    } catch (err) {
      haptics.error();
      showAlert('Photo not updated', mediaErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function saveName() {
    const clean = name.trim();
    if (!clean) return setError('Enter your name.');
    if (clean.length > 40) return setError('Name must be 40 characters or fewer.');
    if (clean === (displayName ?? '')) return next();
    setSaving(true);
    try {
      await updateName(clean);
      next();
    } catch (err) {
      haptics.error();
      setError(authErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const hasPhoto = !!profile?.avatarUrl;
  const primary =
    step === 0
      ? { label: hasPhoto ? 'Continue' : 'Add Photo', onPress: hasPhoto ? next : () => setSheet(true) }
      : step === 1
        ? { label: 'Continue', onPress: saveName }
        : { label: 'Start Chatting', onPress: finish };

  return (
    <View style={[styles.flex, { backgroundColor: theme.background, backgroundImage: BACKDROP[scheme] }]}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.top}>
            <View style={styles.dots}>
              {Array.from({ length: STEPS }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    { backgroundColor: i <= step ? Accent : theme.backgroundSelected },
                    i === step && styles.dotActive,
                  ]}
                />
              ))}
            </View>
            {step < STEPS - 1 ? (
              <Pressable onPress={finish} hitSlop={10} accessibilityRole="button">
                <Text style={[styles.skip, { color: theme.textSecondary }]}>Skip</Text>
              </Pressable>
            ) : null}
          </View>

          <Animated.View
            key={step}
            entering={SlideInRight.springify().damping(20)}
            exiting={SlideOutLeft.duration(180)}
            style={styles.body}>
            {step === 0 ? (
              <>
                <Pressable
                  onPress={() => setSheet(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Choose profile photo">
                  <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.ring, { backgroundImage: GRADIENT }]}>
                    <View style={[styles.ringInner, { backgroundColor: theme.background }]}>
                      <Avatar id={uid} name={shownName || '?'} size={136} uri={profile?.avatarUrl} />
                    </View>
                  </Animated.View>
                  <View style={[styles.camera, { borderColor: theme.background }]}>
                    {uploading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Icon name="camera.fill" size={18} color="#fff" fallback="📷" />
                    )}
                  </View>
                </Pressable>
                <Text style={[styles.title, { color: theme.text }]}>
                  {hasPhoto ? 'Looking good!' : 'Add a profile photo'}
                </Text>
                <Text style={[styles.text, { color: theme.textSecondary }]}>
                  Your friends see it in chats, calls and the contacts row.
                </Text>
              </>
            ) : step === 1 ? (
              <>
                <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.badge, { backgroundImage: GRADIENT }]}>
                  <Icon name="person.fill" size={42} color="#fff" fallback="👤" />
                </Animated.View>
                <Text style={[styles.title, { color: theme.text }]}>What should friends call you?</Text>
                <Text style={[styles.text, { color: theme.textSecondary }]}>
                  You can change it any time in Settings.
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setTyped}
                  placeholder="Your name"
                  placeholderTextColor={theme.textSecondary}
                  maxLength={40}
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="done"
                  onSubmitEditing={saveName}
                  style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.separator }]}
                />
                {error ? (
                  <Animated.Text entering={FadeIn} style={styles.error}>
                    {error}
                  </Animated.Text>
                ) : null}
              </>
            ) : (
              <>
                <Animated.View entering={ZoomIn.springify().damping(10)} style={[styles.badge, { backgroundImage: GRADIENT }]}>
                  <Icon name="sparkles" size={42} color="#fff" fallback="✨" />
                </Animated.View>
                <Text style={[styles.title, { color: theme.text }]}>
                  You&apos;re all set{shownName ? `, ${shownName.split(' ')[0]}` : ''}!
                </Text>
                <View style={[styles.tips, { backgroundColor: theme.card }]}>
                  {TIPS.map((tip, i) => (
                    <Animated.View
                      key={tip.title}
                      entering={FadeInDown.delay(120 + i * 80).springify().damping(18)}
                      style={styles.tip}>
                      <View style={[styles.tipIcon, { backgroundColor: `${Accent}1F` }]}>
                        <Icon name={tip.icon} size={17} color={Accent} fallback={tip.fallback} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={[styles.tipTitle, { color: theme.text }]}>{tip.title}</Text>
                        <Text style={[styles.tipText, { color: theme.textSecondary }]}>{tip.text}</Text>
                      </View>
                    </Animated.View>
                  ))}
                </View>
              </>
            )}
          </Animated.View>

          <View style={styles.bottom}>
            <ScalePressable
              onPress={primary.onPress}
              disabled={saving || uploading}
              accessibilityRole="button"
              style={[styles.button, { backgroundImage: GRADIENT, opacity: saving || uploading ? 0.6 : 1 }]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{primary.label}</Text>}
            </ScalePressable>
            {step === 0 && !hasPhoto ? (
              <Pressable onPress={next} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.later, { color: theme.textSecondary }]}>Maybe later</Text>
              </Pressable>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ActionSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Profile photo"
        options={[
          ...(Platform.OS !== 'web'
            ? [{ label: 'Take Photo', icon: 'camera.fill' as const, fallback: '📷', onPress: () => choosePhoto('camera') }]
            : []),
          { label: 'Choose from Library', icon: 'photo.on.rectangle', fallback: '🖼', onPress: () => choosePhoto('library') },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    minHeight: 40,
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 24 },
  skip: { fontSize: 16, fontWeight: '500' },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  ring: { padding: 4, borderRadius: 80 },
  ringInner: { padding: 4, borderRadius: 76 },
  camera: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    backgroundColor: Accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 12px 30px rgba(32,138,239,0.4)',
  },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 },
  text: { fontSize: 16, textAlign: 'center', lineHeight: 22 },
  input: {
    alignSelf: 'stretch',
    fontSize: 18,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    minHeight: 54,
    textAlign: 'center',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  error: { color: '#E5484D', fontSize: 14 },
  tips: { alignSelf: 'stretch', borderRadius: 18, padding: Spacing.three, gap: 14 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tipIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tipTitle: { fontSize: 15, fontWeight: '600' },
  tipText: { fontSize: 13, lineHeight: 18 },
  bottom: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three, gap: Spacing.three, alignItems: 'center' },
  button: {
    alignSelf: 'stretch',
    maxWidth: 460,
    width: '100%',
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 20px rgba(32,138,239,0.35)',
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  later: { fontSize: 15, fontWeight: '500' },
});
