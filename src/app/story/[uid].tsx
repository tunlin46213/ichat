import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  Easing,
  withDelay,
  withSpring,
  withTiming,
  ZoomIn,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { toast } from '@/components/toast';
import { useAuth } from '@/context/auth';
import { useStories } from '@/context/stories';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import { ensureChat, sendMessage } from '@/lib/chat';
import { haptics } from '@/lib/haptics';
import {
  backgroundCss,
  deleteStory,
  loadStoryPhoto,
  markStoryViewed,
  reactionSummary,
  reactToStory,
  seenBy,
  STORY_SECONDS,
  type Story,
} from '@/lib/stories';

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];
const MORE_EMOJIS = [
  '😍', '🥰', '😘', '🤩', '😎', '🥳', '🤯', '😱',
  '🥺', '😭', '😡', '🤔', '🙏', '👍', '💯', '✨',
  '🎉', '💖', '💔', '🤣', '😅', '🙌', '👀', '🌹',
];
const BURST_COUNT = 9;
const DISMISS_AT = 120;

function ago(story: Story) {
  const ms = Date.now() - (story.createdAt?.toMillis() ?? Date.now());
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function confirmDelete(onConfirm: () => void, onCancel: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm('Delete this story?')) onConfirm();
    else onCancel();
    return;
  }
  Alert.alert('Delete this story?', 'It will be removed for everyone.', [
    { text: 'Cancel', style: 'cancel', onPress: onCancel },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

/**
 * Full-screen story player for one person. Tap right / left for next / previous, hold
 * to pause, drag down to close. When their stories end it moves on to the next person
 * in `queue` (comma-separated uids).
 */
export default function StoryViewerScreen() {
  const { uid: ownerId, queue } = useLocalSearchParams<{ uid: string; queue?: string }>();
  const { user, displayName } = useAuth();
  const myUid = user!.uid;
  const mine = ownerId === myUid;
  const { groupFor } = useStories();
  const group = groupFor(ownerId);
  const stories = group?.stories ?? [];
  const owner = useUserProfile(ownerId);
  const ownerName = mine ? 'Your story' : (owner?.name ?? 'Story');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Start at the first story I haven't seen (mine: from the beginning).
  const [index, setIndex] = useState(() => {
    if (mine) return 0;
    const first = stories.findIndex((s) => !seenBy(s, myUid));
    return first < 0 ? 0 : first;
  });
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Emojis floating up after a reaction: x positions picked when it's sent.
  const [burst, setBurst] = useState<{ key: number; emoji: string; xs: number[] } | null>(null);
  const burstCount = useRef(0);
  const current: Story | undefined = stories[Math.min(index, stories.length - 1)];
  const photoUri = useStoryPhoto(current);
  const ready = !!current && (current.kind === 'text' || !!photoUri);
  const paused = held || typing || viewersOpen || emojiOpen;
  const myReaction = current?.reactions?.[myUid];

  const progress = useSharedValue(0);
  const drag = useSharedValue(0);

  function close() {
    router.back();
  }

  function goNext() {
    progress.set(0);
    if (index < stories.length - 1) {
      setIndex(index + 1);
      return;
    }
    const rest = (queue ?? '').split(',').filter(Boolean);
    if (rest.length) {
      router.replace({ pathname: '/story/[uid]', params: { uid: rest[0], queue: rest.slice(1).join(',') } });
    } else {
      close();
    }
  }

  function goPrev() {
    progress.set(0);
    if (index > 0) setIndex(index - 1);
  }

  // Nothing (left) to show: their stories expired or were deleted.
  useEffect(() => {
    if (!group) router.back();
  }, [group]);

  // Run the progress bar while the story is loaded and not paused; then go on.
  const currentId = current?.id;
  useEffect(() => {
    if (!currentId || !ready || paused) {
      cancelAnimation(progress);
      return;
    }
    const remaining = (1 - progress.get()) * STORY_SECONDS * 1000;
    progress.set(
      withTiming(1, { duration: remaining }, (finished) => {
        if (finished) scheduleOnRN(goNext);
      })
    );
    return () => cancelAnimation(progress);
    // goNext changes every render; the timer only restarts when these do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, ready, paused, progress]);

  // Tell the owner I saw it.
  const alreadySeen = !!current && seenBy(current, myUid);
  useEffect(() => {
    if (!currentId || mine || alreadySeen) return;
    markStoryViewed(currentId, myUid).catch(() => {});
  }, [currentId, mine, alreadySeen, myUid]);

  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetY: 14,
    failOffsetX: [-20, 20],
    onUpdate: (e) => {
      drag.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      if (e.translationY > DISMISS_AT) {
        haptics.light();
        close();
        return;
      }
      drag.set(withSpring(0, { damping: 20, stiffness: 220 }));
    },
  });
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.get() }, { scale: 1 - Math.min(drag.get(), 300) / 1500 }],
    borderRadius: Math.min(drag.get() / 4, 28),
  }));

  async function sendReply(text: string) {
    if (!current || !text.trim()) return;
    const label = current.kind === 'photo' ? (current.text ? `Photo · ${current.text}` : 'Photo') : current.text ?? '';
    try {
      haptics.light();
      const chatId = await ensureChat(
        { uid: myUid, name: displayName ?? 'User' },
        { uid: ownerId, name: owner?.name ?? '' }
      );
      await sendMessage(chatId, myUid, ownerId, text.trim(), {
        id: `story_${current.id}`,
        text: `Story: ${label}`.slice(0, 200),
        senderId: ownerId,
      });
      setReply('');
      setSent(text.trim().length <= 2 ? `${text.trim()} sent` : 'Reply sent');
      setTimeout(() => setSent(null), 1500);
    } catch {
      haptics.error();
      setSent('Could not send');
      setTimeout(() => setSent(null), 1500);
    }
  }

  /** Tap an emoji: set it as my reaction (tap it again to remove), with a little burst. */
  function react(emoji: string) {
    if (!current) return;
    const next = myReaction === emoji ? null : emoji;
    haptics.light();
    setEmojiOpen(false);
    reactToStory(current.id, myUid, next).catch(() => toast.error('Could not react. Try again.'));
    if (!next) return;
    burstCount.current += 1;
    const key = burstCount.current;
    // Scattered but deterministic x positions (0–1) for this burst.
    const xs = Array.from({ length: BURST_COUNT }, (_, i) => {
      const v = Math.sin(key * 12.9898 + i * 78.233) * 43758.5453;
      return v - Math.floor(v);
    });
    setBurst({ key, emoji: next, xs });
    // The owner also gets it in the chat, like Instagram.
    sendReply(next);
  }

  function remove() {
    if (!current) return;
    const target = current;
    setHeld(true); // pause while the confirmation is up
    confirmDelete(
      () => {
        setHeld(false);
        progress.set(0);
        deleteStory(target).then(
          () => haptics.success(),
          () => haptics.error()
        );
        // The last one: the screen closes itself once the list is empty.
        if (stories.length > 1 && index >= stories.length - 1) setIndex(index - 1);
      },
      () => setHeld(false)
    );
  }

  if (!current) {
    return <View style={[styles.fill, styles.black]} />;
  }

  const viewerIds = [
    ...new Set([...Object.keys(current.viewers ?? {}), ...Object.keys(current.reactions ?? {})]),
  ].filter((id) => id !== myUid);
  const summary = reactionSummary(current);

  return (
    <GestureHandlerRootView style={[styles.fill, styles.black]}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.fill, styles.card, dragStyle]}>
          {/* Story content */}
          {current.kind === 'text' ? (
            <View style={[StyleSheet.absoluteFill, styles.textStory, { backgroundImage: backgroundCss(current.background) }]}>
              <Animated.Text key={current.id} entering={ZoomIn.springify().damping(16)} style={styles.bigText}>
                {current.text}
              </Animated.Text>
            </View>
          ) : photoUri ? (
            <Animated.View key={current.id} entering={FadeIn.duration(180)} style={StyleSheet.absoluteFill}>
              <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} />
              <View style={[StyleSheet.absoluteFill, styles.dim]} />
              <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="contain" />
            </Animated.View>
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.loading]}>
              <ActivityIndicator color="#fff" />
            </View>
          )}

          {/* Tap left / right, hold to pause. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={(e) => (e.nativeEvent.locationX < width * 0.3 ? goPrev() : goNext())}
            onLongPress={() => setHeld(true)}
            onPressOut={() => {
              if (held) setHeld(false);
            }}
            delayLongPress={200}
            accessibilityLabel="Tap for next story, tap the left edge for the previous one"
          />

          {/* Top: progress bars, who, when */}
          <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
            <View style={styles.bars}>
              {stories.map((s, i) => (
                <ProgressBar key={s.id} state={i < index ? 'done' : i > index ? 'todo' : 'now'} progress={progress} />
              ))}
            </View>
            <View style={styles.header} pointerEvents="box-none">
              <Avatar id={ownerId} name={owner?.name ?? '?'} size={34} uri={owner?.avatarUrl} />
              <Text style={styles.name} numberOfLines={1}>
                {ownerName}
              </Text>
              <Text style={styles.time}>{ago(current)}</Text>
              <View style={styles.flex} />
              {paused && held ? <Icon name="pause.fill" size={16} color="#fff" fallback="❚❚" /> : null}
              {mine ? (
                <Pressable onPress={remove} hitSlop={10} accessibilityLabel="Delete story" style={styles.iconButton}>
                  <Icon name="trash.fill" size={18} color="#fff" fallback="🗑" />
                </Pressable>
              ) : null}
              <Pressable onPress={close} hitSlop={10} accessibilityLabel="Close" style={styles.iconButton}>
                <Icon name="xmark" size={20} color="#fff" fallback="✕" />
              </Pressable>
            </View>
          </View>

          {/* Bottom: caption, then reply or views */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'web' ? undefined : 'padding'}
            style={styles.bottomWrap}
            pointerEvents="box-none">
            {current.kind === 'photo' && current.text ? (
              <Text style={styles.caption}>{current.text}</Text>
            ) : null}
            {sent ? (
              <Animated.Text entering={FadeIn} exiting={FadeOut} style={styles.sent}>
                {sent}
              </Animated.Text>
            ) : null}
            <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
              {mine ? (
                <Pressable
                  onPress={() => setViewersOpen(true)}
                  accessibilityRole="button"
                  style={styles.views}>
                  <Icon name="eye" size={18} color="#fff" fallback="👁" />
                  <Text style={styles.viewsText}>
                    {viewerIds.length ? `${viewerIds.length} ${viewerIds.length === 1 ? 'view' : 'views'}` : 'No views yet'}
                  </Text>
                  {summary.length ? (
                    <View style={styles.summary}>
                      {summary.slice(0, 4).map(([emoji, n]) => (
                        <Text key={emoji} style={styles.summaryText}>
                          {emoji}
                          {n > 1 ? ` ${n}` : ''}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  <Icon name="chevron.up" size={13} color="rgba(255,255,255,0.8)" fallback="⌃" />
                </Pressable>
              ) : (
                <>
                  {emojiOpen ? (
                    <Animated.View entering={FadeIn.duration(150)} style={styles.emojiGrid}>
                      {MORE_EMOJIS.map((emoji) => (
                        <Pressable
                          key={emoji}
                          onPress={() => react(emoji)}
                          accessibilityLabel={`React ${emoji}`}
                          style={({ pressed }) => [
                            styles.gridEmoji,
                            myReaction === emoji && styles.reactionOn,
                            pressed && { transform: [{ scale: 1.25 }] },
                          ]}>
                          <Text style={styles.gridEmojiText}>{emoji}</Text>
                        </Pressable>
                      ))}
                    </Animated.View>
                  ) : null}
                  {typing ? null : (
                    <View style={styles.reactions}>
                      {QUICK_REACTIONS.map((emoji) => (
                        <Pressable
                          key={emoji}
                          onPress={() => react(emoji)}
                          accessibilityLabel={myReaction === emoji ? `Remove ${emoji} reaction` : `React ${emoji}`}
                          accessibilityState={{ selected: myReaction === emoji }}
                          style={({ pressed }) => [
                            styles.reaction,
                            myReaction === emoji && styles.reactionOn,
                            pressed && { transform: [{ scale: 1.3 }] },
                          ]}>
                          <Text style={styles.reactionText}>{emoji}</Text>
                        </Pressable>
                      ))}
                      <Pressable
                        onPress={() => {
                          haptics.selection();
                          setEmojiOpen((v) => !v);
                        }}
                        accessibilityLabel={emojiOpen ? 'Fewer emojis' : 'More emojis'}
                        style={[styles.reaction, styles.more]}>
                        {myReaction && !QUICK_REACTIONS.includes(myReaction) && !emojiOpen ? (
                          <Text style={styles.reactionText}>{myReaction}</Text>
                        ) : (
                          <Icon name={emojiOpen ? 'xmark' : 'plus'} size={20} color="#fff" fallback={emojiOpen ? '✕' : '+'} />
                        )}
                      </Pressable>
                    </View>
                  )}
                  <View style={styles.replyRow}>
                    <TextInput
                      value={reply}
                      onChangeText={setReply}
                      onFocus={() => setTyping(true)}
                      onBlur={() => setTyping(false)}
                      placeholder={`Reply to ${owner?.name?.split(' ')[0] ?? 'story'}…`}
                      placeholderTextColor="rgba(255,255,255,0.7)"
                      returnKeyType="send"
                      onSubmitEditing={() => sendReply(reply)}
                      maxLength={1000}
                      style={styles.replyInput}
                    />
                    {reply.trim() ? (
                      <Pressable onPress={() => sendReply(reply)} accessibilityLabel="Send reply" style={styles.send}>
                        <Icon name="arrow.up" size={18} color="#000" fallback="↑" />
                      </Pressable>
                    ) : null}
                  </View>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </GestureDetector>

      {burst ? <EmojiBurst key={burst.key} emoji={burst.emoji} xs={burst.xs} width={width} /> : null}

      {viewersOpen ? (
        <ViewersSheet
          story={current}
          viewerIds={viewerIds}
          bottomInset={insets.bottom}
          onClose={() => setViewersOpen(false)}
        />
      ) : null}
    </GestureHandlerRootView>
  );
}

/** A handful of the chosen emoji floating up from the reaction bar and fading out. */
function EmojiBurst({ emoji, xs, width }: { emoji: string; xs: number[]; width: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {xs.map((x, i) => (
        <FloatingEmoji key={i} emoji={emoji} left={20 + x * (width - 80)} delay={i * 70} drift={(x - 0.5) * 60} />
      ))}
    </View>
  );
}

function FloatingEmoji({ emoji, left, delay, drift }: {
  emoji: string;
  left: number;
  delay: number;
  drift: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(delay, withTiming(1, { duration: 1500, easing: Easing.out(Easing.cubic) })));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.get() < 0.7 ? Math.min(1, t.get() * 5) : (1 - t.get()) / 0.3,
    transform: [
      { translateY: -t.get() * 420 },
      { translateX: Math.sin(t.get() * Math.PI * 2) * 12 + drift * t.get() },
      { scale: 0.6 + Math.min(t.get() * 2, 1) * 0.8 },
    ],
  }));
  return <Animated.Text style={[styles.floating, { left }, style]}>{emoji}</Animated.Text>;
}

function useStoryPhoto(story: Story | undefined) {
  const id = story?.kind === 'photo' ? story.id : null;
  const [state, setState] = useState<{ id: string; uri: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let active = true;
    loadStoryPhoto(id).then(
      (uri) => active && setState({ id, uri }),
      () => {}
    );
    return () => {
      active = false;
    };
  }, [id]);
  return id && state?.id === id ? state.uri : null;
}

function ProgressBar({ state, progress }: { state: 'done' | 'now' | 'todo'; progress: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({
    width: `${(state === 'done' ? 1 : state === 'todo' ? 0 : progress.get()) * 100}%`,
  }));
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, fill]} />
    </View>
  );
}

function ViewersSheet({ story, viewerIds, bottomInset, onClose }: {
  story: Story;
  viewerIds: string[];
  bottomInset: number;
  onClose: () => void;
}) {
  const profiles = useUserProfiles(viewerIds);
  const reactions = story.reactions ?? {};
  const summary = reactionSummary(story);
  const [only, setOnly] = useState<string | null>(null);
  // People who reacted first, then newest viewers.
  const ordered = [...viewerIds]
    .filter((uid) => !only || reactions[uid] === only)
    .sort(
      (a, b) =>
        Number(!!reactions[b]) - Number(!!reactions[a]) ||
        (story.viewers?.[b]?.toMillis() ?? 0) - (story.viewers?.[a]?.toMillis() ?? 0)
    );
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        entering={FadeIn.duration(180)}
        style={[styles.sheet, { paddingBottom: bottomInset + 16 }]}>
        <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>
          {viewerIds.length ? `Seen by ${viewerIds.length}` : 'No views yet'}
          {summary.length ? (
            <Text style={styles.sheetSub}>
              {'  ·  '}
              {Object.keys(reactions).length} {Object.keys(reactions).length === 1 ? 'reaction' : 'reactions'}
            </Text>
          ) : null}
        </Text>
        {summary.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Pressable
              onPress={() => setOnly(null)}
              style={[styles.chip, !only && styles.chipOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: !only }}>
              <Text style={styles.chipText}>All {viewerIds.length}</Text>
            </Pressable>
            {summary.map(([emoji, n]) => (
              <Pressable
                key={emoji}
                onPress={() => setOnly(only === emoji ? null : emoji)}
                style={[styles.chip, only === emoji && styles.chipOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: only === emoji }}>
                <Text style={styles.chipText}>
                  {emoji} {n}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <ScrollView style={styles.sheetList}>
          {ordered.map((uid) => {
            const p = profiles[uid];
            const at = story.viewers?.[uid];
            return (
              <View key={uid} style={styles.viewer}>
                <View>
                  <Avatar id={uid} name={p?.name ?? '?'} size={44} uri={p?.avatarUrl} />
                  {reactions[uid] ? (
                    <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.viewerBadge}>
                      <Text style={styles.viewerBadgeText}>{reactions[uid]}</Text>
                    </Animated.View>
                  ) : null}
                </View>
                <View style={styles.flex}>
                  <Text style={styles.viewerName} numberOfLines={1}>
                    {p?.name ?? 'Someone'}
                  </Text>
                  <Text style={styles.viewerTime}>
                    {reactions[uid] ? 'Reacted · ' : 'Viewed · '}
                    {at ? at.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
                  </Text>
                </View>
                {reactions[uid] ? <Text style={styles.viewerEmoji}>{reactions[uid]}</Text> : null}
              </View>
            );
          })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  black: { backgroundColor: '#000' },
  card: { overflow: 'hidden', backgroundColor: '#000' },
  textStory: { alignItems: 'center', justifyContent: 'center', padding: 28 },
  bigText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 8,
  },
  dim: { backgroundColor: 'rgba(0,0,0,0.35)' },
  loading: { alignItems: 'center', justifyContent: 'center' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    gap: 10,
    backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 100%)',
    paddingBottom: 18,
  },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: '#fff', fontSize: 15, fontWeight: '700', maxWidth: '50%' },
  time: { color: 'rgba(255,255,255,0.75)', fontSize: 14 },
  iconButton: { padding: 6 },
  bottomWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  caption: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
  sent: {
    alignSelf: 'center',
    color: '#fff',
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
  },
  bottom: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
    backgroundImage: 'linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)',
  },
  reactions: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  reaction: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  reactionOn: { backgroundColor: 'rgba(255,255,255,0.28)' },
  reactionText: { fontSize: 28 },
  more: { backgroundColor: 'rgba(255,255,255,0.18)', width: 38, height: 38, borderRadius: 19 },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    padding: 8,
    borderRadius: 22,
    backgroundColor: 'rgba(28,28,30,0.85)',
  },
  gridEmoji: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  gridEmojiText: { fontSize: 26 },
  floating: { position: 'absolute', bottom: 150, fontSize: 38 },
  summary: { flexDirection: 'row', gap: 6, marginLeft: 6 },
  summaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  sheetSub: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '500' },
  chips: { gap: 8, paddingBottom: 10 },
  chip: { paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  chipOn: { backgroundColor: 'rgba(255,255,255,0.3)' },
  chipText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  viewerBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBadgeText: { fontSize: 13 },
  viewerEmoji: { fontSize: 26 },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  views: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', padding: 8 },
  viewsText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  scrim: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '60%',
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 10,
  },
  sheetTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  sheetList: { flexGrow: 0 },
  viewer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  viewerName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  viewerTime: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 1 },
});
