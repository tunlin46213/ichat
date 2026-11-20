import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
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
} from 'react-native';

import { ActionSheet } from '@/components/action-sheet';
import { Icon } from '@/components/icon';
import { toast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { mediaErrorMessage, pickImages, type PickedImage } from '@/lib/media';
import { MAX_MOMENT_PHOTOS, MAX_MOMENT_TEXT, postMoment } from '@/lib/moments';

/** Compose a moment: some text, up to 9 photos, or both. */
export default function NewMomentScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<PickedImage[]>([]);
  const [adding, setAdding] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [posting, setPosting] = useState(false);
  const canPost = !posting && !preparing && (text.trim().length > 0 || photos.length > 0);

  async function addPhotos(source: 'library' | 'camera') {
    try {
      const picked = await pickImages(source, 1080);
      if (!picked.length) return;
      setPreparing(true);
      const room = MAX_MOMENT_PHOTOS - photos.length;
      const ready: PickedImage[] = [];
      for (const make of picked.slice(0, room)) ready.push(await make());
      setPhotos((list) => [...list, ...ready].slice(0, MAX_MOMENT_PHOTOS));
      if (picked.length > room) toast.info(`A moment holds up to ${MAX_MOMENT_PHOTOS} photos.`);
    } catch (err) {
      toast.error(mediaErrorMessage(err));
    } finally {
      setPreparing(false);
    }
  }

  async function share() {
    if (!canPost || !user) return;
    setPosting(true);
    try {
      await postMoment(user.uid, text, photos);
      haptics.success();
      toast.success('Moment shared', 'checkmark.circle.fill');
      router.back();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      toast.error(
        code === 'permission-denied'
          ? 'Moments aren’t switched on yet. The admin needs to publish the latest database rules.'
          : 'Could not share it. Check your connection and try again.'
      );
      setPosting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'New Moment',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.headerButton, { color: theme.accent }]}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={share} disabled={!canPost} hitSlop={10} accessibilityRole="button">
              {posting ? (
                <ActivityIndicator />
              ) : (
                <Text style={[styles.headerButton, styles.bold, { color: canPost ? theme.accent : theme.textSecondary }]}>
                  Share
                </Text>
              )}
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          autoFocus
          multiline
          value={text}
          onChangeText={setText}
          maxLength={MAX_MOMENT_TEXT}
          placeholder="What’s happening?"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
        />
        <View style={styles.grid}>
          {photos.map((p, i) => (
            <View key={i} style={[styles.cell, { backgroundColor: theme.backgroundElement }]}>
              <Image source={{ uri: `data:image/jpeg;base64,${p.base64}` }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <Pressable
                onPress={() => setPhotos((list) => list.filter((_, j) => j !== i))}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${i + 1}`}
                style={styles.remove}>
                <Icon name="xmark" size={12} color="#fff" fallback="✕" />
              </Pressable>
            </View>
          ))}
          {photos.length < MAX_MOMENT_PHOTOS ? (
            <Pressable
              onPress={() => setAdding(true)}
              disabled={preparing}
              accessibilityRole="button"
              accessibilityLabel="Add photos"
              style={[styles.cell, styles.add, { borderColor: theme.separator }]}>
              {preparing ? (
                <ActivityIndicator />
              ) : (
                <>
                  <Icon name="plus" size={26} color={theme.textSecondary} fallback="＋" />
                  <Text style={[styles.addText, { color: theme.textSecondary }]}>
                    {photos.length ? `${photos.length}/${MAX_MOMENT_PHOTOS}` : 'Photos'}
                  </Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          Everyone on iChat can see your moments. They stay until you delete them.
        </Text>
      </ScrollView>
      <ActionSheet
        visible={adding}
        title="Add photos"
        onClose={() => setAdding(false)}
        options={[
          ...(Platform.OS !== 'web'
            ? [{ label: 'Camera', icon: 'camera.fill' as const, fallback: '📷', onPress: () => addPhotos('camera') }]
            : []),
          { label: 'Photo Library', icon: 'photo.on.rectangle', fallback: '🖼', onPress: () => addPhotos('library') },
        ]}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  headerButton: { fontSize: 17, paddingHorizontal: 8 },
  bold: { fontWeight: '700' },
  input: {
    fontSize: 18,
    lineHeight: 25,
    minHeight: 110,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: { borderWidth: 1.5, borderStyle: 'dashed', gap: 2 },
  addText: { fontSize: 12, fontWeight: '600' },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { fontSize: 13, lineHeight: 18 },
});
