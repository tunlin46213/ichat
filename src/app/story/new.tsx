import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
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
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ScalePressable } from '@/components/scale-pressable';
import { useAuth } from '@/context/auth';
import { haptics } from '@/lib/haptics';
import {
  backgroundCss,
  postPhotoStory,
  postTextStory,
  setStoryDraft,
  STORY_BACKGROUNDS,
  takeStoryDraft,
  type StoryBackgroundId,
} from '@/lib/stories';

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/** Compose a story: a picked photo with a caption, or text on a colored background. */
export default function NewStoryScreen() {
  const { mode } = useLocalSearchParams<{ mode?: 'photo' | 'text' }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [photo] = useState(() => (mode === 'photo' ? takeStoryDraft() : null));
  const [text, setText] = useState('');
  const [background, setBackground] = useState<StoryBackgroundId>('ocean');
  const [busy, setBusy] = useState(false);
  const isText = mode !== 'photo';
  const canShare = isText ? text.trim().length > 0 : !!photo;

  function close() {
    setStoryDraft(null);
    router.back();
  }

  async function share() {
    if (!canShare || busy || !user) return;
    setBusy(true);
    try {
      if (photo) await postPhotoStory(user.uid, photo, text);
      else await postTextStory(user.uid, text, background);
      haptics.success();
      close();
    } catch (err) {
      haptics.error();
      const code = (err as { code?: string }).code;
      showAlert(
        'Story not shared',
        code === 'permission-denied'
          ? 'Blocked by the database rules. Publish the latest firestore.rules in the Firebase console.'
          : 'Check your connection and try again.'
      );
      setBusy(false);
    }
  }

  function nextBackground() {
    haptics.selection();
    const i = STORY_BACKGROUNDS.findIndex((b) => b.id === background);
    setBackground(STORY_BACKGROUNDS[(i + 1) % STORY_BACKGROUNDS.length].id);
  }

  return (
    <View style={[styles.fill, isText ? { backgroundImage: backgroundCss(background) } : styles.black]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={close} hitSlop={10} accessibilityLabel="Cancel" style={styles.round}>
            <Icon name="xmark" size={18} color="#fff" fallback="✕" />
          </Pressable>
          {isText ? (
            <Pressable
              onPress={nextBackground}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Change background"
              style={[styles.round, styles.palette]}>
              <Icon name="paintbrush.fill" size={16} color="#fff" fallback="🎨" />
            </Pressable>
          ) : null}
        </View>

        {isText ? (
          <View style={styles.center}>
            <TextInput
              autoFocus
              value={text}
              onChangeText={setText}
              placeholder="Type something…"
              placeholderTextColor="rgba(255,255,255,0.6)"
              multiline
              maxLength={300}
              textAlign="center"
              style={styles.bigText}
            />
          </View>
        ) : photo ? (
          <Animated.View entering={FadeIn} style={styles.center}>
            <Image
              source={{ uri: `data:image/jpeg;base64,${photo.base64}` }}
              style={[styles.photo, { aspectRatio: photo.width / photo.height }]}
              contentFit="contain"
            />
          </Animated.View>
        ) : (
          <View style={styles.center}>
            <Text style={styles.missing}>No photo selected.</Text>
          </View>
        )}

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
          {photo ? (
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Add a caption…"
              placeholderTextColor="rgba(255,255,255,0.6)"
              maxLength={300}
              style={styles.caption}
            />
          ) : (
            <View style={styles.flex} />
          )}
          <Animated.View entering={ZoomIn.springify().damping(14)}>
            <ScalePressable
              onPress={share}
              disabled={!canShare || busy}
              accessibilityRole="button"
              accessibilityLabel="Share to your story"
              style={[styles.share, { opacity: canShare ? 1 : 0.5 }]}>
              {busy ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Text style={styles.shareText}>Your Story</Text>
                  <Icon name="arrow.right" size={15} color="#000" fallback="→" />
                </>
              )}
            </ScalePressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  black: { backgroundColor: '#000' },
  top: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  round: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  palette: { backgroundColor: 'rgba(255,255,255,0.25)' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  bigText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    alignSelf: 'stretch',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 8,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  photo: { width: '100%', maxHeight: '100%', borderRadius: 18 },
  missing: { color: 'rgba(255,255,255,0.7)', fontSize: 16 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 10 },
  caption: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: '#fff',
  },
  shareText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
