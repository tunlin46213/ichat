import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
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
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { LinkifiedText } from '@/components/chat/linkified-text';
import { toast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { UserProfile } from '@/lib/chat';
import { confirmDestructive } from '@/lib/confirm';
import { haptics } from '@/lib/haptics';
import { deleteMoment, isLiked, toggleLike, useMomentPhoto, type Moment, type MomentPhoto } from '@/lib/moments';

export function timeAgo(ms: number | null | undefined, now: number) {
  if (!ms) return 'now';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** One post in the feed (or at the top of its comments page). */
export function MomentCard({ moment, myUid, profiles, now, onOpen }: {
  moment: Moment;
  myUid: string;
  profiles: Record<string, UserProfile>;
  now: number;
  /** open the post with its comments (omitted on that page itself) */
  onOpen?: () => void;
}) {
  const theme = useTheme();
  const [viewer, setViewer] = useState<number | null>(null);
  const author = profiles[moment.authorId];
  const name = moment.authorId === myUid ? 'You' : (author?.name ?? 'Someone');
  const liked = isLiked(moment, myUid);
  const likers = Object.keys(moment.likes ?? {});
  const likeNames = likers.map((uid) => (uid === myUid ? 'You' : (profiles[uid]?.name?.split(' ')[0] ?? 'Someone')));
  const comments = moment.commentCount ?? 0;
  const mine = moment.authorId === myUid;

  function like() {
    haptics.light();
    toggleLike(moment, myUid).catch(() => toast.error('Could not like it. Check your connection.'));
  }

  function remove() {
    confirmDestructive({
      title: 'Delete this moment?',
      message: 'It is removed for everyone, with its photos, likes and comments.',
      confirmLabel: 'Delete',
      onConfirm: () =>
        deleteMoment(moment).then(
          () => {
            toast.success('Moment deleted', 'trash.fill');
            if (!onOpen) router.back();
          },
          () => toast.error('Could not delete it. Try again.')
        ),
    });
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.head}>
        <Pressable
          onPress={() =>
            mine ? null : router.push({ pathname: '/user/[id]', params: { id: moment.authorId, name } })
          }
          accessibilityRole="button"
          style={styles.headLeft}>
          <Avatar id={moment.authorId} name={author?.name ?? name} size={40} uri={author?.avatarUrl} />
          <View>
            <Text style={[styles.name, { color: theme.text }]}>{name}</Text>
            <Text style={[styles.time, { color: theme.textSecondary }]}>
              {timeAgo(moment.createdAt?.toMillis(), now)}
            </Text>
          </View>
        </Pressable>
        {mine ? (
          <Pressable onPress={remove} hitSlop={10} accessibilityRole="button" accessibilityLabel="Delete moment">
            <Icon name="trash" size={17} color={theme.textSecondary} fallback="🗑" />
          </Pressable>
        ) : null}
      </View>

      {moment.text ? (
        <Pressable onPress={onOpen} disabled={!onOpen}>
          <LinkifiedText text={moment.text} style={[styles.text, { color: theme.text }]} linkColor={theme.accent} />
        </Pressable>
      ) : null}

      {moment.photos?.length ? <PhotoGrid photos={moment.photos} onOpen={setViewer} /> : null}

      <View style={[styles.actions, { borderTopColor: theme.separator }]}>
        <Pressable onPress={like} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} style={styles.action}>
          <Animated.View key={liked ? 'on' : 'off'} entering={liked ? ZoomIn.springify().damping(10) : undefined}>
            <Icon name={liked ? 'heart.fill' : 'heart'} size={20} color={liked ? '#FF3B30' : theme.textSecondary} fallback={liked ? '❤️' : '♡'} />
          </Animated.View>
          <Text style={[styles.actionText, { color: liked ? '#FF3B30' : theme.textSecondary }]}>
            {likers.length || 'Like'}
          </Text>
        </Pressable>
        <Pressable onPress={onOpen} disabled={!onOpen} accessibilityRole="button" style={styles.action}>
          <Icon name="bubble.left" size={19} color={theme.textSecondary} fallback="💬" />
          <Text style={[styles.actionText, { color: theme.textSecondary }]}>{comments || 'Comment'}</Text>
        </Pressable>
      </View>
      {likeNames.length ? (
        <Text style={[styles.likers, { color: theme.textSecondary }]} numberOfLines={2}>
          ❤️ {likeNames.join(', ')}
        </Text>
      ) : null}

      {viewer !== null && moment.photos ? (
        <MomentPhotoViewer photos={moment.photos} start={viewer} onClose={() => setViewer(null)} />
      ) : null}
    </View>
  );
}

/** 1 photo: as it is (capped); 2 and 4: two columns; otherwise three. */
function PhotoGrid({ photos, onOpen }: { photos: MomentPhoto[]; onOpen: (i: number) => void }) {
  const { width } = useWindowDimensions();
  const full = Math.min(width, 640) - Spacing.three * 2 - Spacing.three * 2;
  if (photos.length === 1) {
    const p = photos[0];
    const ratio = Math.min(Math.max(p.width / Math.max(p.height, 1), 0.66), 1.6);
    return (
      <Pressable onPress={() => onOpen(0)} accessibilityLabel="Photo, open">
        <Thumb photo={p} style={{ width: full, height: full / ratio, borderRadius: Radius.md }} />
      </Pressable>
    );
  }
  const cols = photos.length === 2 || photos.length === 4 ? 2 : 3;
  const size = Math.floor((full - (cols - 1) * 4) / cols);
  return (
    <View style={styles.grid}>
      {photos.map((p, i) => (
        <Pressable key={p.id} onPress={() => onOpen(i)} accessibilityLabel={`Photo ${i + 1}, open`}>
          <Thumb photo={p} style={{ width: size, height: size, borderRadius: 8 }} />
        </Pressable>
      ))}
    </View>
  );
}

function Thumb({ photo, style }: { photo: MomentPhoto; style: object }) {
  const theme = useTheme();
  const { uri, failed } = useMomentPhoto(photo.id);
  const preview = uri ?? (photo.thumb ? `data:image/jpeg;base64,${photo.thumb}` : null);
  return (
    <View style={[style, styles.thumb, { backgroundColor: theme.backgroundElement }]}>
      {preview ? (
        <Image source={{ uri: preview }} blurRadius={uri ? 0 : 10} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : null}
      {failed ? (
        <Icon name="photo" size={18} color={theme.textSecondary} fallback="🖼" />
      ) : !uri ? (
        <ActivityIndicator color={preview ? '#fff' : undefined} />
      ) : null}
    </View>
  );
}

/** Full-screen photos, swipe sideways; tap or "Done" to close. */
function MomentPhotoViewer({ photos, start, onClose }: { photos: MomentPhoto[]; start: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(start);
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} style={styles.viewer}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: start * width, y: 0 }}
          scrollEventThrottle={50}
          onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
          {photos.map((p) => (
            <Pressable key={p.id} onPress={onClose} style={{ width, height }} accessibilityLabel="Close">
              <FullPhoto photo={p} />
            </Pressable>
          ))}
        </ScrollView>
        <View style={[styles.viewerTop, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.viewerCount}>
            {photos.length > 1 ? `${index + 1} of ${photos.length}` : ''}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Text style={styles.viewerDone}>Done</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

function FullPhoto({ photo }: { photo: MomentPhoto }) {
  const { uri } = useMomentPhoto(photo.id);
  return uri ? (
    <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
  ) : (
    <View style={[StyleSheet.absoluteFill, styles.center]}>
      <ActivityIndicator color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, padding: Spacing.three, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 16, fontWeight: '700' },
  time: { fontSize: 12, marginTop: 1 },
  text: { fontSize: 16, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  thumb: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 22, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  likers: { fontSize: 13, marginTop: -4 },
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
  viewerCount: { color: '#fff', fontSize: 15, fontWeight: '600' },
  viewerDone: { color: '#fff', fontSize: 17, fontWeight: '700' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
