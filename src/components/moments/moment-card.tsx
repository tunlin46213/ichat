import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { LinkifiedText } from '@/components/chat/linkified-text';
import { Icon } from '@/components/icon';
import { PopoverMenu, type PopoverAnchor, type PopoverItem } from '@/components/popover-menu';
import { toast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useBlocks } from '@/context/blocks';
import { useTheme } from '@/hooks/use-theme';
import type { UserProfile } from '@/lib/chat';
import { confirmDestructive } from '@/lib/confirm';
import { haptics } from '@/lib/haptics';
import { REPORT_REASONS } from '@/lib/moderation';
import { saveBase64Photo, saveLabel } from '@/lib/save-photo';
import {
  deleteMoment,
  isLiked,
  loadMomentPhoto,
  reportMoment,
  toggleLike,
  useMomentPhoto,
  useRecentComments,
  type Moment,
  type MomentPhoto,
} from '@/lib/moments';

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

/**
 * Tells a single tap from a double tap: the single one waits a moment in case a second
 * tap follows. Returns a press handler.
 */
export function useDoubleTap(onSingle: (() => void) | undefined, onDouble: () => void, delay = 260) {
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  return () => {
    const now = Date.now();
    if (now - last.current < delay) {
      last.current = 0;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      onDouble();
      return;
    }
    last.current = now;
    if (!onSingle) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      onSingle();
    }, delay);
  };
}

/** Big heart that pops over a photo or comment on a double tap. */
export function HeartBurst({ size = 90 }: { size?: number }) {
  return (
    <Animated.View
      pointerEvents="none"
      entering={ZoomIn.springify().damping(9)}
      exiting={FadeOut.duration(220)}
      style={[StyleSheet.absoluteFill, styles.center]}>
      <Icon name="heart.fill" size={size} color="#fff" fallback="❤️" />
    </Animated.View>
  );
}

// Text-only moments that are short get a colourful card, like a status update.
const GRADIENTS = [
  ['#FF6B6B', '#FF8E53'],
  ['#6A5AE0', '#B06AF6'],
  ['#0BA5EC', '#38D9A9'],
  ['#F7567C', '#FFAA5C'],
  ['#1F2A44', '#4B6CB7'],
  ['#11998E', '#38EF7D'],
] as const;

export function gradientFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const [a, b] = GRADIENTS[Math.abs(h) % GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

const SEE_MORE_LINES = 5;

function isLong(text: string) {
  return text.length > 280 || text.split('\n').length > SEE_MORE_LINES;
}

/** One post in the feed (or at the top of its comments page). */
export function MomentCard({ moment, myUid, profiles, now, onOpen, isNew }: {
  moment: Moment;
  myUid: string;
  profiles: Record<string, UserProfile>;
  now: number;
  /** posted since I last opened Moments */
  isNew?: boolean;
  /** open the post with its comments (omitted on that page itself) */
  onOpen?: () => void;
}) {
  const theme = useTheme();
  const { blocked } = useBlocks();
  const [viewer, setViewer] = useState<number | null>(null);
  const [menu, setMenu] = useState<{
    at: PopoverAnchor;
    page: 'main' | 'report' | 'share' | 'likes';
  } | null>(null);
  const moreButton = useRef<ComponentRef<typeof View>>(null);
  const shareButton = useRef<ComponentRef<typeof View>>(null);
  const likesButton = useRef<ComponentRef<typeof View>>(null);
  const [expanded, setExpanded] = useState(false);
  const [burst, setBurst] = useState(0);
  const [saveMenu, setSaveMenu] = useState<{ at: PopoverAnchor; index: number } | null>(null);
  const author = profiles[moment.authorId];
  const mine = moment.authorId === myUid;
  const name = mine ? 'You' : (author?.name ?? 'Someone');
  const liked = isLiked(moment, myUid);
  const likers = Object.entries(moment.likes ?? {})
    // A like still being saved has no time yet: it is the newest.
    .sort(([, a], [, b]) => (b?.toMillis() ?? now) - (a?.toMillis() ?? now))
    .map(([uid]) => uid);
  const comments = moment.commentCount ?? 0;
  const preview = useRecentComments(moment.id, !!onOpen && comments > 0).filter((c) => !blocked.includes(c.authorId));
  const text = moment.text ?? '';
  const photos = moment.photos ?? [];
  const statusCard = !photos.length && text.length > 0 && text.length <= 120 && text.split('\n').length <= 4;
  const long = !statusCard && isLong(text);

  function like() {
    haptics.light();
    toggleLike(moment, myUid).catch(() => toast.error('Could not like it. Check your connection.'));
  }

  // Double tap = like (never unlike), with a heart over the photo.
  function doubleTapLike() {
    haptics.light();
    setBurst((n) => n + 1);
    if (!liked) toggleLike(moment, myUid).catch(() => toast.error('Could not like it. Check your connection.'));
  }

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(0), 750);
    return () => clearTimeout(t);
  }, [burst]);

  function remove() {
    confirmDestructive({
      title: 'Delete this moment?',
      message: 'It is removed for everyone, with its photos, likes and comments.',
      confirmLabel: 'Delete',
      // On the moment's own page, its "deleted" effect leaves the screen.
      onConfirm: () =>
        deleteMoment(moment).then(
          () => toast.success('Moment deleted', 'trash.fill'),
          () => toast.error('Could not delete it. Try again.')
        ),
    });
  }

  function openMenu(page: 'main' | 'share' = 'main') {
    const button = page === 'share' ? shareButton : moreButton;
    button.current?.measureInWindow((x, y, width, height) => setMenu({ at: { x, y, width, height }, page }));
  }

  const shareOptions: PopoverItem[] = [
    {
      label: 'Send in a Chat',
      icon: 'paperplane.fill',
      fallback: '✈️',
      onPress: () =>
        router.push({
          pathname: '/users',
          params: { shareMomentId: moment.id, shareMomentAuthor: author?.name ?? 'Someone' },
        }),
    },
    ...(Platform.OS !== 'web' && text
      ? [{
          label: 'Share Text…',
          icon: 'square.and.arrow.up' as const,
          fallback: '⇪',
          // The system share sheet (Messages, Notes, Telegram…); photos stay in iChat.
          onPress: () => {
            Share.share({ message: `${text}\n\n— ${author?.name ?? 'Someone'} on iChat` }).catch(() => {});
          },
        }]
      : []),
  ];

  const mainOptions: PopoverItem[] = [
    ...(text
      ? [{
          label: 'Copy Text',
          icon: 'doc.on.doc' as const,
          fallback: '📋',
          onPress: () => {
            Clipboard.setStringAsync(text).then(() => toast.success('Copied', 'doc.on.doc'));
          },
        }]
      : []),
    ...(onOpen ? [{ label: 'Comments', icon: 'bubble.left' as const, fallback: '💬', onPress: onOpen }] : []),
    ...(mine
      ? [{ label: 'Delete Moment', icon: 'trash' as const, fallback: '🗑', destructive: true, onPress: remove }]
      : [{
          label: 'Report…',
          icon: 'flag' as const,
          fallback: '🚩',
          destructive: true,
          keepOpen: true,
          onPress: () => setMenu((m) => (m ? { ...m, page: 'report' } : null)),
        }]),
  ];
  const reportOptions: PopoverItem[] = REPORT_REASONS.map((reason) => ({
    label: reason,
    onPress: () =>
      reportMoment(moment, myUid, reason).then(
        () => toast.success('Thanks. The admin will take a look.', 'checkmark.circle.fill'),
        () => toast.error('Could not send the report. Try again.')
      ),
  }));

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      {/* Author */}
      <View style={styles.head}>
        <Pressable
          onPress={() => openProfile(moment.authorId, author?.name)}
          accessibilityRole="button"
          accessibilityLabel={`${author?.name ?? name}, view profile`}
          style={styles.headLeft}>
          <Avatar id={moment.authorId} name={author?.name ?? name} size={42} uri={author?.avatarUrl} />
          <View style={styles.headText}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                {name}
              </Text>
              {isNew ? (
                <View style={[styles.newBadge, { backgroundColor: theme.accent }]}>
                  <Text style={styles.newText}>NEW</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.time, { color: theme.textSecondary }]}>
              {timeAgo(moment.createdAt?.toMillis(), now)}
              {photos.length > 1 ? ` · ${photos.length} photos` : ''}
            </Text>
          </View>
        </Pressable>
        <Pressable
          ref={moreButton}
          onPress={() => openMenu('main')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="More"
          style={[styles.more, { backgroundColor: theme.backgroundElement }]}>
          <Icon name="ellipsis" size={16} color={theme.textSecondary} fallback="•••" />
        </Pressable>
      </View>

      {/* Text: a colourful status card, or text with "See more" */}
      {statusCard ? (
        <DoubleTapArea onSingle={onOpen} onDouble={doubleTapLike} label="Moment, double tap to like">
          <View style={[styles.status, { backgroundImage: gradientFor(moment.id) }]}>
            <LinkifiedText text={text} style={styles.statusText} linkColor="#fff" />
            {burst ? <HeartBurst key={burst} size={70} /> : null}
          </View>
        </DoubleTapArea>
      ) : text ? (
        <Pressable onPress={long && !expanded ? () => setExpanded(true) : onOpen} disabled={!onOpen && !(long && !expanded)}>
          <LinkifiedText
            text={text}
            numberOfLines={long && !expanded ? SEE_MORE_LINES : undefined}
            style={[styles.text, { color: theme.text }]}
            linkColor={theme.accent}
          />
          {long && !expanded ? (
            <Text style={[styles.seeMore, { color: theme.textSecondary }]}>See more</Text>
          ) : null}
        </Pressable>
      ) : null}

      {photos.length ? (
        <View>
          <PhotoMosaic
            photos={photos}
            onOpen={setViewer}
            onDouble={doubleTapLike}
            onHold={(index, at) => {
              haptics.medium();
              setSaveMenu({ index, at });
            }}
          />
          {burst ? <HeartBurst key={burst} /> : null}
        </View>
      ) : null}

      {/* Likes summary: a few faces + names */}
      {likers.length ? (
        <Pressable
          ref={likesButton}
          onPress={() =>
            likesButton.current?.measureInWindow((x, y, width, height) =>
              setMenu({ at: { x, y, width, height }, page: 'likes' })
            )
          }
          accessibilityRole="button"
          accessibilityLabel="See who liked this"
          style={styles.likeRow}>
          <View style={styles.faces}>
            {likers.slice(0, 3).map((uid, i) => (
              <View key={uid} style={[styles.face, { borderColor: theme.card, marginLeft: i ? -7 : 0, zIndex: 3 - i }]}>
                <Avatar id={uid} name={profiles[uid]?.name ?? '?'} size={20} uri={profiles[uid]?.avatarUrl} />
              </View>
            ))}
          </View>
          <Text style={[styles.likeText, { color: theme.textSecondary }]} numberOfLines={1}>
            {likeSummary(likers, myUid, profiles)}
          </Text>
        </Pressable>
      ) : null}

      {/* Actions */}
      <View style={[styles.actions, { borderTopColor: theme.separator }]}>
        <Pressable onPress={like} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} style={styles.action}>
          <Animated.View key={liked ? 'on' : 'off'} entering={liked ? ZoomIn.springify().damping(10) : undefined}>
            <Icon name={liked ? 'heart.fill' : 'heart'} size={20} color={liked ? '#FF3B30' : theme.textSecondary} fallback={liked ? '❤️' : '♡'} />
          </Animated.View>
          <Text style={[styles.actionText, { color: liked ? '#FF3B30' : theme.textSecondary }]}>
            {likers.length ? likers.length : 'Like'}
          </Text>
        </Pressable>
        <Pressable onPress={onOpen} disabled={!onOpen} accessibilityRole="button" style={styles.action}>
          <Icon name="bubble.left" size={19} color={theme.textSecondary} fallback="💬" />
          <Text style={[styles.actionText, { color: theme.textSecondary }]}>{comments || 'Comment'}</Text>
        </Pressable>
        <Pressable
          ref={shareButton}
          onPress={() => openMenu('share')}
          accessibilityRole="button"
          accessibilityLabel="Share"
          style={styles.action}>
          <Icon name="paperplane" size={18} color={theme.textSecondary} fallback="✈️" />
          <Text style={[styles.actionText, { color: theme.textSecondary }]}>Share</Text>
        </Pressable>
      </View>

      {/* Latest comments (feed only) */}
      {onOpen && preview.length ? (
        <Pressable onPress={onOpen} accessibilityRole="button" style={styles.preview}>
          {comments > preview.length ? (
            <Text style={[styles.viewAll, { color: theme.textSecondary }]}>View all {comments} comments</Text>
          ) : null}
          {preview.map((c) => (
            <Text key={c.id} style={[styles.previewLine, { color: theme.text }]} numberOfLines={2}>
              <Text style={styles.previewName}>
                {c.authorId === myUid ? 'You' : (profiles[c.authorId]?.name?.split(' ')[0] ?? 'Someone')}
              </Text>
              {'  '}
              {c.text}
            </Text>
          ))}
        </Pressable>
      ) : null}

      <PopoverMenu
        anchor={saveMenu?.at ?? null}
        items={[
          {
            label: saveLabel,
            icon: 'square.and.arrow.down',
            fallback: '⬇',
            onPress: () => saveMenu && savePhoto(photos[saveMenu.index]),
          },
          { label: 'View Photo', icon: 'photo', fallback: '🖼', onPress: () => saveMenu && setViewer(saveMenu.index) },
        ]}
        onClose={() => setSaveMenu(null)}
      />
      <PopoverMenu
        anchor={menu?.at ?? null}
        title={
          menu?.page === 'report'
            ? 'Why are you reporting this?'
            : menu?.page === 'likes'
              ? `Liked by ${likers.length}`
              : undefined
        }
        items={
          menu?.page === 'report'
            ? reportOptions
            : menu?.page === 'share'
              ? shareOptions
              : menu?.page === 'likes'
                ? likers.slice(0, 12).map((uid) => ({
                    label: uid === myUid ? 'You' : (profiles[uid]?.name ?? 'Someone'),
                    icon: 'heart.fill' as const,
                    fallback: '❤️',
                    onPress: () => openProfile(uid, profiles[uid]?.name),
                  }))
                : mainOptions
        }
        onBack={menu?.page === 'report' ? () => setMenu((m) => (m ? { ...m, page: 'main' } : null)) : undefined}
        onClose={() => setMenu(null)}
      />

      {viewer !== null && photos.length ? (
        <MomentPhotoViewer photos={photos} start={viewer} onClose={() => setViewer(null)} />
      ) : null}
    </View>
  );
}

/** Someone's profile (also my own: it shows my moments and an Edit button). */
export function openProfile(uid: string, name?: string) {
  router.push({ pathname: '/user/[id]', params: { id: uid, ...(name ? { name } : {}) } });
}

/** Saves one moment photo to Photos (a download on web). */
export function savePhoto(photo: MomentPhoto | undefined) {
  if (!photo) return;
  loadMomentPhoto(photo.id)
    .then((uri) => saveBase64Photo(uri.slice(uri.indexOf(',') + 1), photo.id))
    .then(
      () => {
        haptics.success();
        toast.success(Platform.OS === 'web' ? 'Downloaded' : 'Saved to Photos', 'checkmark.circle.fill');
      },
      (err) =>
        toast.error(
          (err as { code?: string })?.code === 'save/permission'
            ? 'Allow iChat to add photos in Settings to save them.'
            : 'Could not save the photo. Try again.'
        )
    );
}

function likeSummary(likers: string[], myUid: string, profiles: Record<string, UserProfile>) {
  const first = (uid: string) => (uid === myUid ? 'You' : (profiles[uid]?.name?.split(' ')[0] ?? 'Someone'));
  // "You" first when I liked it, then the most recent.
  const ordered = likers.includes(myUid) ? [myUid, ...likers.filter((u) => u !== myUid)] : likers;
  if (ordered.length === 1) return `Liked by ${first(ordered[0])}`;
  if (ordered.length === 2) return `Liked by ${first(ordered[0])} and ${first(ordered[1])}`;
  return `Liked by ${first(ordered[0])} and ${ordered.length - 1} others`;
}

function DoubleTapArea({ onSingle, onDouble, label, children }: {
  onSingle?: () => void;
  onDouble: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const press = useDoubleTap(onSingle, onDouble);
  return (
    <Pressable onPress={press} accessibilityLabel={label}>
      {children}
    </Pressable>
  );
}

const GAP = 4;

/**
 * 1 photo: its own shape (capped) · 2: side by side, tall · 3: one large + two stacked ·
 * 4: 2×2 · 5+: 2×2 with "+N" on the last.
 */
function PhotoMosaic({ photos, onOpen, onDouble, onHold }: {
  photos: MomentPhoto[];
  onOpen: (i: number) => void;
  onDouble: () => void;
  onHold: (i: number, at: PopoverAnchor) => void;
}) {
  const { width } = useWindowDimensions();
  // Measured, not the window: on web the app sits in a phone frame narrower than the window.
  const [measured, setMeasured] = useState(0);
  const W = measured || Math.min(width, 640) - Spacing.three * 4;
  const n = photos.length;
  const cell = (i: number, w: number, h: number, extra = 0) => (
    <PhotoCell
      key={photos[i].id}
      photo={photos[i]}
      index={i}
      w={w}
      h={h}
      extra={extra}
      onOpen={onOpen}
      onDouble={onDouble}
      onHold={onHold}
    />
  );

  let body: React.ReactNode;
  if (n === 1) {
    const p = photos[0];
    const ratio = Math.min(Math.max(p.width / Math.max(p.height, 1), 0.7), 1.6);
    body = cell(0, W, Math.round(W / ratio));
  } else if (n === 2) {
    const w = (W - GAP) / 2;
    body = (
      <View style={styles.row}>
        {cell(0, w, w * 1.3)}
        {cell(1, w, w * 1.3)}
      </View>
    );
  } else if (n === 3) {
    const H = W * 0.75;
    const big = (W - GAP) * 0.6;
    const small = W - GAP - big;
    body = (
      <View style={styles.row}>
        {cell(0, big, H)}
        <View style={styles.col}>
          {cell(1, small, (H - GAP) / 2)}
          {cell(2, small, (H - GAP) / 2)}
        </View>
      </View>
    );
  } else {
    const s = (W - GAP) / 2;
    body = (
      <View style={styles.wrap}>
        {[0, 1, 2, 3].map((i) => cell(i, s, s, i === 3 ? n - 4 : 0))}
      </View>
    );
  }
  return (
    <View onLayout={(e) => setMeasured(Math.floor(e.nativeEvent.layout.width))} style={styles.mosaic}>
      {body}
    </View>
  );
}

function PhotoCell({ photo, index, w, h, extra, onOpen, onDouble, onHold }: {
  photo: MomentPhoto;
  index: number;
  w: number;
  h: number;
  /** photos not shown ("+N" over this one) */
  extra: number;
  onOpen: (i: number) => void;
  onDouble: () => void;
  onHold: (i: number, at: PopoverAnchor) => void;
}) {
  const press = useDoubleTap(() => onOpen(index), onDouble);
  return (
    <Pressable
      onPress={press}
      onLongPress={(e) => onHold(index, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, width: 0, height: 0 })}
      delayLongPress={350}
      accessibilityLabel={`Photo ${index + 1}. Double tap to like, long press to save`}>
      <Thumb photo={photo} style={{ width: w, height: h }} />
      {extra > 0 ? (
        <View style={[StyleSheet.absoluteFill, styles.extra]}>
          <Text style={styles.extraText}>+{extra}</Text>
        </View>
      ) : null}
    </Pressable>
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
          <Text style={styles.viewerCount}>{photos.length > 1 ? `${index + 1} of ${photos.length}` : ''}</Text>
          <View style={styles.viewerButtons}>
            <Pressable
              onPress={() => savePhoto(photos[index])}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={saveLabel}>
              <Icon name="square.and.arrow.down" size={20} color="#fff" fallback="⬇" />
            </Pressable>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
              <Text style={styles.viewerDone}>Done</Text>
            </Pressable>
          </View>
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

/** Card-shaped placeholders with a soft pulse while the feed loads. */
export function MomentSkeleton({ count = 3 }: { count?: number }) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    pulse.set(withRepeat(withTiming(0.45, { duration: 800 }), -1, true));
  }, [pulse, reduce]);
  const fade = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const fill = { backgroundColor: theme.backgroundElement };
  return (
    <Animated.View style={[styles.skeletonList, fade]} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, { backgroundColor: theme.card }]}>
          <View style={styles.headLeft}>
            <View style={[fill, styles.skAvatar]} />
            <View style={styles.skLines}>
              <View style={[fill, styles.skLine, { width: '40%' }]} />
              <View style={[fill, styles.skLine, { width: '22%' }]} />
            </View>
          </View>
          <View style={[fill, styles.skLine, { width: `${70 + ((i * 13) % 25)}%` }]} />
          {i % 2 === 0 ? <View style={[fill, styles.skPhoto]} /> : null}
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, padding: Spacing.three, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headText: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  newBadge: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  newText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  time: { fontSize: 12, marginTop: 1 },
  more: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16, lineHeight: 22 },
  seeMore: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  status: {
    minHeight: 180,
    borderRadius: Radius.md,
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  statusText: { color: '#fff', fontSize: 23, lineHeight: 31, fontWeight: '700', textAlign: 'center' },
  mosaic: { borderRadius: Radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: GAP },
  col: { gap: GAP },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  thumb: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  extra: { backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  extraText: { color: '#fff', fontSize: 26, fontWeight: '700' },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -2 },
  faces: { flexDirection: 'row' },
  face: { borderWidth: 2, borderRadius: 12 },
  likeText: { flex: 1, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 22, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  preview: { gap: 4, marginTop: -4 },
  viewAll: { fontSize: 13, fontWeight: '600' },
  previewLine: { fontSize: 14, lineHeight: 19 },
  previewName: { fontWeight: '700' },
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
  viewerButtons: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  center: { alignItems: 'center', justifyContent: 'center' },
  skeletonList: { gap: Spacing.three },
  skAvatar: { width: 42, height: 42, borderRadius: 21 },
  skLines: { flex: 1, gap: 6 },
  skLine: { height: 12, borderRadius: 6 },
  skPhoto: { height: 180, borderRadius: Radius.md },
});
