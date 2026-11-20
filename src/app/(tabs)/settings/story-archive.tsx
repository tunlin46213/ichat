import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { backgroundCss, deleteArchivedStory, loadStoryArchive, type ArchivedStory } from '@/lib/stories';

function when(s: ArchivedStory) {
  return s.createdAt
    ? s.createdAt.toDate().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
}

/**
 * Settings → Story Archive: my stories after their 24 hours, kept only for me (a small
 * copy; the full photo is deleted with the story).
 */
export default function StoryArchiveScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const uid = user!.uid;
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<ArchivedStory[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState<ArchivedStory | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStoryArchive(uid).then(
      (list) => !cancelled && setItems(list),
      (err: { code?: string }) =>
        !cancelled &&
        setFailed(
          err?.code === 'permission-denied'
            ? 'The archive isn’t switched on yet. The admin needs to publish the latest database rules.'
            : 'Could not load your archive. Check your connection.'
        )
    );
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const cell = Math.floor((Math.min(width, 640) - Spacing.three * 2 - 8) / 3);

  function remove(story: ArchivedStory) {
    confirmDestructive({
      title: 'Delete from archive?',
      message: 'Only you can see your archive. This removes it for good.',
      confirmLabel: 'Delete',
      onConfirm: () =>
        deleteArchivedStory(uid, story.id).then(
          () => {
            setOpen(null);
            setItems((list) => list?.filter((s) => s.id !== story.id) ?? null);
            toast.success('Deleted from archive', 'trash.fill');
          },
          () => toast.error('Could not delete it. Is the latest firestore.rules published?')
        ),
    });
  }

  return (
    <>
      <ScrollView
        style={{ backgroundColor: theme.groupedBackground }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}>
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          Your stories stay here after their 24 hours. Only you can see them.
        </Text>
        {!items && !failed ? (
          <ActivityIndicator style={styles.loading} />
        ) : failed ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>{failed}</Text>
        ) : items!.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            No stories yet. The ones you post from now on are kept here.
          </Text>
        ) : (
          <View style={styles.grid}>
            {items!.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setOpen(s)}
                accessibilityRole="button"
                accessibilityLabel={`Story from ${when(s)}`}
                style={[styles.cell, { width: cell, height: cell * 1.6, backgroundColor: theme.backgroundElement }]}>
                <StoryFace story={s} small />
                <Text style={styles.date}>{when(s)}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
      {open ? <ArchiveViewer story={open} onClose={() => setOpen(null)} onDelete={() => remove(open)} /> : null}
    </>
  );
}

function StoryFace({ story, small }: { story: ArchivedStory; small?: boolean }) {
  if (story.kind === 'photo') {
    return story.preview ? (
      <Image source={{ uri: `data:image/jpeg;base64,${story.preview}` }} style={StyleSheet.absoluteFill} contentFit="cover" />
    ) : (
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={styles.missing}>Photo</Text>
      </View>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundImage: backgroundCss(story.background) }]}>
      <Text style={[styles.storyText, small && styles.storyTextSmall]} numberOfLines={small ? 5 : undefined}>
        {story.text}
      </Text>
    </View>
  );
}

function ArchiveViewer({ story, onClose, onDelete }: { story: ArchivedStory; onClose: () => void; onDelete: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} style={styles.viewer}>
        <StoryFace story={story} />
        {story.kind === 'photo' && story.text ? (
          <Text style={[styles.caption, { bottom: insets.bottom + 90 }]}>{story.text}</Text>
        ) : null}
        <View style={[styles.viewerTop, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.viewerDate}>{when(story)}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.viewerClose}>Done</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          style={[styles.deleteButton, { bottom: insets.bottom + 24 }]}>
          <Text style={styles.deleteText}>Delete from Archive</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  note: { fontSize: 13, lineHeight: 18 },
  loading: { marginTop: Spacing.five },
  empty: { fontSize: 15, textAlign: 'center', marginTop: Spacing.five },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { borderRadius: Radius.md, overflow: 'hidden', justifyContent: 'flex-end' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 10 },
  date: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    margin: 6,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  missing: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  storyText: { color: '#fff', fontSize: 26, fontWeight: '700', textAlign: 'center' },
  storyTextSmall: { fontSize: 12 },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  viewerDate: { color: '#fff', fontSize: 15, fontWeight: '600' },
  viewerClose: { color: '#fff', fontSize: 17, fontWeight: '700' },
  caption: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    color: '#fff',
    fontSize: 17,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
  deleteButton: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,59,48,0.9)',
  },
  deleteText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
