import { Image } from 'expo-image';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuroraBackground } from '@/components/aurora';
import { Avatar } from '@/components/avatar';
import { HeaderAction } from '@/components/header-action';
import { Icon } from '@/components/icon';
import { ListMessage } from '@/components/list-states';
import { MomentCard, MomentSkeleton } from '@/components/moments/moment-card';
import { ScalePressable } from '@/components/scale-pressable';
import { LargeTitleHeader } from '@/components/web-header';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useBlocks } from '@/context/blocks';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import { haptics } from '@/lib/haptics';
import {
  findMomentMemory,
  getMomentsSeenAt,
  hideMemoryToday,
  isMemoryHiddenToday,
  markMomentsSeen,
  useMomentPhoto,
  useMomentsFeed,
  useUserMoments,
  type Moment,
  type MomentMemory,
} from '@/lib/moments';

const PAGE = 15;

type Filter = 'all' | 'photos' | 'mine';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'photos', label: 'Photos' },
  { key: 'mine', label: 'Mine' },
];

/** Today / This Week / Earlier, by when the moment was posted. */
function sectionOf(m: Moment, now: number) {
  const at = m.createdAt?.toMillis() ?? now;
  if (new Date(at).toDateString() === new Date(now).toDateString()) return 'TODAY';
  if (now - at < 7 * 86_400_000) return 'THIS WEEK';
  return 'EARLIER';
}

/** My moment from this day in an earlier year / month, unless hidden for today. */
function useMemory(myUid: string) {
  const mine = useUserMoments(myUid);
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    isMemoryHiddenToday().then((h) => active && setHidden(h));
    return () => {
      active = false;
    };
  }, []);
  const item = hidden === false && mine ? findMomentMemory(mine) : null;
  return {
    item,
    hide: () => {
      hideMemoryToday();
      setHidden(true);
    },
  };
}

function MemoryCard({ memory, onHide }: { memory: MomentMemory; onHide: () => void }) {
  const theme = useTheme();
  const m = memory.moment;
  const photo = m.photos?.[0];
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/moment/[id]', params: { id: m.id } })}
      accessibilityRole="button"
      accessibilityLabel={`On this day, ${memory.label}. Open`}
      style={[styles.memory, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}>
      {photo ? <MemoryPhoto photo={photo} /> : null}
      <View style={styles.memoryBody}>
        <Text style={[styles.memoryKicker, { color: theme.accent }]}>✨ ON THIS DAY</Text>
        <Text style={[styles.memoryTitle, { color: theme.text }]}>{memory.label}</Text>
        {m.text ? (
          <Text style={[styles.memoryText, { color: theme.textSecondary }]} numberOfLines={2}>
            {m.text}
          </Text>
        ) : null}
      </View>
      <Pressable onPress={onHide} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide for today">
        <Icon name="xmark" size={14} color={theme.textSecondary} fallback="✕" />
      </Pressable>
    </Pressable>
  );
}

function MemoryPhoto({ photo }: { photo: NonNullable<Moment['photos']>[number] }) {
  const theme = useTheme();
  const { uri } = useMomentPhoto(photo.id);
  const source = uri ?? (photo.thumb ? `data:image/jpeg;base64,${photo.thumb}` : null);
  return (
    <View style={[styles.memoryPhoto, { backgroundColor: theme.backgroundElement }]}>
      {source ? <Image source={{ uri: source }} blurRadius={uri ? 0 : 8} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
    </View>
  );
}
/** Scrolled further than this, a new post shows the "New moments" pill instead of jumping. */
const PILL_AFTER = 400;

/** Moments: posts with photos that stay, with likes and comments (newest first). */
export default function MomentsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myUid = user!.uid;
  const { blocked } = useBlocks();
  const [count, setCount] = useState(PAGE);
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const feed = useMomentsFeed(true, count, reload);
  const now = useNow(60_000);
  const [filter, setFilter] = useState<Filter>('all');
  const visible = (feed?.moments ?? []).filter((m) => !blocked.includes(m.authorId));
  const moments = visible.filter((m) =>
    filter === 'photos' ? !!m.photos?.length : filter === 'mine' ? m.authorId === myUid : true
  );
  const profiles = useUserProfiles([myUid, ...moments.flatMap((m) => [m.authorId, ...Object.keys(m.likes ?? {})])]);
  const memory = useMemory(myUid);
  const me = profiles[myUid];
  const list = useRef<FlatList<Moment>>(null);
  const offset = useRef(0);
  const [pill, setPill] = useState(false);

  // Seeing the feed clears the "new moments" dot on the tab. Posts after the previous
  // visit (`cutoff`, taken when the tab comes into view) get a NEW badge.
  const newest = visible[0];
  const newestId = newest?.id;
  const focused = useRef(false);
  const [cutoff, setCutoff] = useState(0);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setCutoff(getMomentsSeenAt());
      markMomentsSeen();
      return () => {
        focused.current = false;
      };
    }, [])
  );
  useEffect(() => {
    if (focused.current && newestId) markMomentsSeen();
  }, [newestId]);
  const isNew = (m: Moment) => cutoff > 0 && m.authorId !== myUid && (m.createdAt?.toMillis() ?? now) > cutoff;
  // "You're all caught up" goes above the first older post, when something new came before it.
  const firstOld = moments.findIndex((m) => !isNew(m));
  const caughtUpAt = firstOld > 0 ? firstOld : -1;

  // Someone else posted while I'm reading further down: offer a way up instead of jumping.
  const lastNewest = useRef<string | undefined>(undefined);
  useEffect(() => {
    const previous = lastNewest.current;
    lastNewest.current = newestId;
    if (!previous || !newestId || previous === newestId) return;
    if (newest?.authorId !== myUid && offset.current > PILL_AFTER) setPill(true);
  }, [newestId, newest?.authorId, myUid]);

  // Pull to refresh: the feed is live, so this re-subscribes and shows the spinner briefly.
  useEffect(() => {
    if (!refreshing) return;
    const t = setTimeout(() => setRefreshing(false), 700);
    return () => clearTimeout(t);
  }, [refreshing]);

  function refresh() {
    haptics.light();
    setRefreshing(true);
    setCount(PAGE);
    setReload((n) => n + 1);
  }

  function toTop() {
    setPill(false);
    list.current?.scrollToOffset({ offset: 0, animated: true });
  }

  const compose = () => router.push('/moment/new' as Href);

  return (
    <>
      {Platform.OS !== 'web' ? (
        <HeaderAction placement="right" icon="square.and.pencil" label="New moment" bold onPress={compose} />
      ) : null}
      <AuroraBackground />
      <FlatList
        ref={list}
        style={styles.transparent}
        data={moments}
        keyExtractor={(m) => m.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        scrollEventThrottle={100}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
          if (pill && offset.current < 120) setPill(false);
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.textSecondary} />}
        ListHeaderComponent={
          <>
            {/* Web only (native has the system large title); it brings its own side padding. */}
            <View style={styles.webHeader}>
              <LargeTitleHeader title="Moments" action={{ icon: 'square.and.pencil', label: 'New moment', onPress: compose }} />
            </View>
            <ScalePressable
              onPress={compose}
              accessibilityRole="button"
              accessibilityLabel="Share a moment"
              style={[styles.composeBar, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}>
              <Avatar id={myUid} name={me?.name ?? user?.displayName ?? 'Me'} size={34} uri={me?.avatarUrl} />
              <Text style={[styles.composeText, { color: theme.textSecondary }]} numberOfLines={1}>
                What’s on your mind?
              </Text>
              <View style={[styles.composeIcon, { backgroundColor: theme.backgroundElement }]}>
                <Icon name="photo.on.rectangle" size={16} color="#34C759" fallback="🖼" />
              </View>
            </ScalePressable>
            {memory.item && filter === 'all' ? (
              <MemoryCard memory={memory.item} onHide={memory.hide} />
            ) : null}
            <View style={styles.chips}>
              {FILTERS.map((f) => {
                const on = filter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => {
                      haptics.light();
                      setFilter(f.key);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[
                      styles.chip,
                      on
                        ? { backgroundColor: theme.accent, borderColor: theme.accent }
                        : { backgroundColor: theme.glassCard, borderColor: theme.glassBorder },
                    ]}>
                    <Text style={[styles.chipText, { color: on ? '#fff' : theme.text }]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        }
        renderItem={({ item, index }) => {
          const section = sectionOf(item, now);
          const showSection = index === 0 || sectionOf(moments[index - 1], now) !== section;
          return (
            <>
              {index === caughtUpAt ? (
                <View style={styles.caughtUp}>
                  <View style={[styles.caughtLine, { backgroundColor: theme.separator }]} />
                  <View style={[styles.caughtBadge, { backgroundColor: '#34C759' }]}>
                    <Icon name="checkmark" size={12} color="#fff" fallback="✓" />
                  </View>
                  <Text style={[styles.caughtText, { color: theme.text }]}>You’re all caught up</Text>
                  <Text style={[styles.caughtSub, { color: theme.textSecondary }]}>Earlier moments</Text>
                </View>
              ) : null}
              {showSection ? <Text style={[styles.section, { color: theme.textSecondary }]}>{section}</Text> : null}
              <MomentCard
                moment={item}
                myUid={myUid}
                profiles={profiles}
                now={now}
                isNew={isNew(item)}
                onOpen={() => router.push({ pathname: '/moment/[id]', params: { id: item.id } })}
              />
            </>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListEmptyComponent={
          !feed ? (
            <MomentSkeleton />
          ) : feed.error ? (
            <ListMessage
              error={
                feed.error === 'permission-denied'
                  ? 'Moments aren’t switched on yet. The admin needs to publish the latest database rules.'
                  : `Could not load moments (${feed.error}).`
              }
            />
          ) : filter !== 'all' && visible.length ? (
            <ListMessage empty={filter === 'mine' ? 'You haven’t shared a moment yet.' : 'No photo moments yet.'} />
          ) : (
            <ListMessage empty={'No moments yet.\nShare a photo or a thought with everyone.'} />
          )
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => feed && feed.moments.length >= count && setCount((n) => n + PAGE)}
        ListFooterComponent={feed && feed.moments.length >= count ? <MomentSkeleton count={1} /> : undefined}
      />
      {pill ? (
        <Animated.View entering={FadeInUp.duration(200)} exiting={FadeOutUp.duration(160)} style={[styles.pillWrap, { top: insets.top + (Platform.OS === 'ios' ? 56 : 12) }]} pointerEvents="box-none">
          <Pressable
            onPress={toTop}
            accessibilityRole="button"
            accessibilityLabel="New moments, scroll to top"
            style={[styles.pill, { backgroundColor: theme.accent }]}>
            <Icon name="arrow.up" size={13} color="#fff" fallback="↑" />
            <Text style={styles.pillText}>New moments</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  transparent: { backgroundColor: 'transparent' },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six },
  webHeader: { marginHorizontal: -Spacing.three },
  composeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    borderRadius: 27,
    paddingLeft: 10,
    paddingRight: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.three,
  },
  composeText: { flex: 1, fontSize: 16 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: Spacing.three },
  chip: { height: 32, borderRadius: 16, paddingHorizontal: 14, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  chipText: { fontSize: 14, fontWeight: '600' },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginLeft: 4, marginBottom: 8 },
  caughtUp: { alignItems: 'center', gap: 4, marginBottom: Spacing.four, marginTop: Spacing.two },
  caughtLine: { position: 'absolute', top: 13, left: 0, right: 0, height: StyleSheet.hairlineWidth },
  caughtBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  caughtText: { fontSize: 15, fontWeight: '700' },
  caughtSub: { fontSize: 13 },
  memory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.three,
  },
  memoryPhoto: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden' },
  memoryBody: { flex: 1, gap: 1 },
  memoryKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  memoryTitle: { fontSize: 15, fontWeight: '700' },
  memoryText: { fontSize: 13 },
  composeIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  gap: { height: Spacing.three },
  pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 14,
    boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
  },
  pillText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
