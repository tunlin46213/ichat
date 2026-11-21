import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { toast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import { haptics } from '@/lib/haptics';
import { mediaErrorMessage, pickImages, type PickedImage } from '@/lib/media';
import {
  clearMomentDraft,
  loadMomentDraft,
  MAX_MOMENT_PHOTOS,
  MAX_MOMENT_TEXT,
  postMoment,
  saveMomentDraft,
} from '@/lib/moments';

type Draft = PickedImage & { key: string };

/** The counter appears once the text gets close to the limit. */
const COUNTER_FROM = MAX_MOMENT_TEXT - 200;

/**
 * Compose a moment: author row, a growing text field, the photos, and a toolbar that
 * rides on top of the keyboard (Photos · Camera · counter).
 */
export default function NewMomentScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const me = useUserProfiles(uid ? [uid] : [])[uid];
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<Draft[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [posting, setPosting] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const canPost = !posting && !preparing && (text.trim().length > 0 || photos.length > 0);
  const room = MAX_MOMENT_PHOTOS - photos.length;

  // With the keyboard up, the toolbar sits right on it (no home-indicator gap).
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Draft: what's here when the screen closes without posting comes back next time.
  const latest = useRef<{ text: string; photos: Draft[] }>({ text: '', photos: [] });
  useEffect(() => {
    latest.current = { text, photos };
  }, [text, photos]);
  const posted = useRef(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    let active = true;
    let loaded = false;
    loadMomentDraft().then((draft) => {
      loaded = true;
      if (!active || !draft) return;
      // Anything typed while it loaded wins.
      if (latest.current.text || latest.current.photos.length) return;
      setText(draft.text);
      setPhotos(draft.photos.map((p, i) => ({ ...p, key: `draft-${i}-${p.base64.length}` })));
      setRestored(true);
    });
    return () => {
      active = false;
      // Closed (or a dev remount) before the saved draft was read: leave it untouched.
      if (posted.current || !loaded) return;
      const { text: t, photos: ps } = latest.current;
      if (!t.trim() && !ps.length) {
        clearMomentDraft();
        return;
      }
      saveMomentDraft({ text: t, photos: ps.map(({ key: _key, ...p }) => p) }).then((keptPhotos) =>
        toast.info(keptPhotos ? 'Saved as a draft' : 'Text saved as a draft (photos were too big to keep)')
      );
    };
  }, []);

  function discardDraft() {
    haptics.light();
    setText('');
    setPhotos([]);
    setRestored(false);
    clearMomentDraft();
  }

  // Android's back button can still leave mid-post; then the finished post must not navigate.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true; // again after a dev StrictMode remount
    return () => {
      mounted.current = false;
    };
  }, []);

  async function addPhotos(source: 'library' | 'camera') {
    if (room <= 0 || preparing) return;
    try {
      const picked = await pickImages(source, 1080);
      if (!picked.length) return;
      setPreparing(true);
      const ready: Draft[] = [];
      for (const make of picked.slice(0, room)) {
        ready.push({ ...(await make()), key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
      }
      setPhotos((list) => [...list, ...ready].slice(0, MAX_MOMENT_PHOTOS));
      haptics.light();
      if (picked.length > room) toast.info(`A moment holds up to ${MAX_MOMENT_PHOTOS} photos.`);
      // The keyboard going away for the picker can leave the page scrolled past the text.
      scroll.current?.scrollTo({ y: 0, animated: true });
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      toast.error(code.startsWith('media/') ? mediaErrorMessage(err) : `Could not add the photo (${code || String(err).slice(0, 60)}).`);
    } finally {
      if (mounted.current) setPreparing(false);
    }
  }

  async function share() {
    if (!canPost || !user) return;
    setPosting(true);
    input.current?.blur();
    try {
      await postMoment(user.uid, text, photos);
      posted.current = true;
      clearMomentDraft();
      haptics.success();
      toast.success('Moment shared', 'checkmark.circle.fill');
      if (mounted.current) router.back();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      toast.error(
        code === 'permission-denied'
          ? 'Moments aren’t switched on yet. The admin needs to publish the latest database rules.'
          : `Could not share it (${code ?? 'network'}). Check your connection and try again.`
      );
      if (mounted.current) setPosting(false);
    }
  }

  const left = MAX_MOMENT_TEXT - text.length;
  // One photo shows large (its own shape, capped); more make a 3-column grid.
  const area = gridWidth || Math.min(width, 640) - Spacing.three * 2;
  const tile = Math.floor((area - 2 * 6) / 3);
  const single = photos.length === 1 ? photos[0] : null;
  const singleRatio = single ? Math.min(Math.max(single.width / Math.max(single.height, 1), 0.75), 1.6) : 1;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'New Moment',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.background },
          // Leaving mid-post would make the post's own router.back() pop one screen too many.
          gestureEnabled: !posting,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} disabled={posting} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.cancel, { color: posting ? theme.textSecondary : theme.text }]}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={share}
              disabled={!canPost}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Post moment"
              style={[styles.post, { backgroundColor: canPost || posting ? theme.accent : theme.backgroundElement }]}>
              {posting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[styles.postText, { color: canPost ? '#fff' : theme.textSecondary }]}>Post</Text>
              )}
            </Pressable>
          ),
        }}
      />

      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        <View style={styles.author}>
          <Avatar id={uid} name={me?.name ?? user?.displayName ?? 'Me'} size={44} uri={me?.avatarUrl} />
          <View style={styles.authorText}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {me?.name ?? user?.displayName ?? 'You'}
            </Text>
            <View style={[styles.audience, { borderColor: theme.separator }]}>
              <Icon name="person.2.fill" size={11} color={theme.accent} fallback="👥" />
              <Text style={[styles.audienceText, { color: theme.accent }]}>Everyone on iChat</Text>
            </View>
          </View>
        </View>

        {restored ? (
          <View style={[styles.draftBar, { backgroundColor: theme.backgroundElement }]}>
            <Icon name="doc.text" size={14} color={theme.textSecondary} fallback="📝" />
            <Text style={[styles.draftText, { color: theme.textSecondary }]}>Your draft is back</Text>
            <Pressable onPress={discardDraft} hitSlop={8} accessibilityRole="button" accessibilityLabel="Discard draft">
              <Text style={[styles.draftDiscard, { color: '#FF3B30' }]}>Discard</Text>
            </Pressable>
          </View>
        ) : null}

        <TextInput
          ref={input}
          autoFocus
          multiline
          scrollEnabled={false}
          value={text}
          onChangeText={setText}
          maxLength={MAX_MOMENT_TEXT}
          placeholder="What’s on your mind?"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
        />

        {photos.length ? (
          <View onLayout={(e) => setGridWidth(Math.floor(e.nativeEvent.layout.width))} style={styles.grid}>
            {photos.map((p, i) => (
              <Animated.View
                key={p.key}
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(140)}
                layout={LinearTransition.duration(180)}
                style={[
                  styles.cell,
                  { backgroundColor: theme.backgroundElement },
                  single
                    ? { width: area, height: Math.round(area / singleRatio) }
                    : { width: tile, height: tile },
                ]}>
                <Image source={{ uri: `data:image/jpeg;base64,${p.base64}` }} style={StyleSheet.absoluteFill} contentFit="cover" />
                {photos.length > 1 ? (
                  <View style={styles.order}>
                    <Text style={styles.orderText}>{i + 1}</Text>
                  </View>
                ) : null}
                <Pressable
                  onPress={() => {
                    haptics.light();
                    setPhotos((list) => list.filter((x) => x.key !== p.key));
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${i + 1}`}
                  style={styles.remove}>
                  <Icon name="xmark" size={11} color="#fff" fallback="✕" />
                </Pressable>
              </Animated.View>
            ))}
          </View>
        ) : null}

        {preparing ? (
          <View style={[styles.preparing, { backgroundColor: theme.backgroundElement }]}>
            <ActivityIndicator />
            <Text style={[styles.preparingText, { color: theme.textSecondary }]}>Preparing photos…</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Toolbar: sits above the keyboard (KeyboardAvoidingView) or the home indicator. */}
      <View
        style={[
          styles.toolbar,
          {
            borderTopColor: theme.separator,
            backgroundColor: theme.background,
            paddingBottom: Platform.OS === 'web' || keyboardUp ? 10 : Math.max(insets.bottom, 10),
          },
        ]}>
        <ToolButton
          icon="photo.on.rectangle"
          fallback="🖼"
          label="Photos"
          color="#34C759"
          disabled={room <= 0 || preparing || posting}
          onPress={() => addPhotos('library')}
        />
        {Platform.OS !== 'web' ? (
          <ToolButton
            icon="camera.fill"
            fallback="📷"
            label="Camera"
            color="#0A84FF"
            disabled={room <= 0 || preparing || posting}
            onPress={() => addPhotos('camera')}
          />
        ) : null}
        <View style={styles.flex} />
        {photos.length ? (
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {photos.length}/{MAX_MOMENT_PHOTOS}
          </Text>
        ) : null}
        {text.length >= COUNTER_FROM ? (
          <Text style={[styles.meta, { color: left < 50 ? '#FF3B30' : theme.textSecondary }]}>{left}</Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function ToolButton({ icon, fallback, label, color, disabled, onPress }: {
  icon: 'photo.on.rectangle' | 'camera.fill';
  fallback: string;
  label: string;
  color: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tool,
        { backgroundColor: theme.backgroundElement, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}>
      <Icon name={icon} size={17} color={color} fallback={fallback} />
      <Text style={[styles.toolText, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, flexGrow: 1 },
  cancel: { fontSize: 17, paddingHorizontal: 6 },
  post: {
    minWidth: 64,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postText: { fontSize: 15, fontWeight: '700' },
  author: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  authorText: { flex: 1, gap: 4, alignItems: 'flex-start' },
  name: { fontSize: 16, fontWeight: '700' },
  audience: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  audienceText: { fontSize: 12, fontWeight: '600' },
  input: {
    fontSize: 19,
    lineHeight: 26,
    minHeight: 64,
    paddingTop: 0,
    paddingHorizontal: 0,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { borderRadius: Radius.md, overflow: 'hidden' },
  order: {
    position: 'absolute',
    left: 6,
    top: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: { color: '#fff', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  draftText: { flex: 1, fontSize: 13, fontWeight: '600' },
  draftDiscard: { fontSize: 13, fontWeight: '700' },
  preparing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  preparingText: { fontSize: 14 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.three,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
  },
  toolText: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
