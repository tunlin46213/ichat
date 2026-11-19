import { createContext, use } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colorsFor } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { MapTiles, PersonMarker, type MapPoint } from '@/components/map-tiles';
import { toast } from '@/components/toast';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { activeLive, stopLiveLocation, type Chat, type LiveLocation, type Message } from '@/lib/chat';
import { haptics } from '@/lib/haptics';
import { stopTracking } from '@/lib/live-location';
import { openInMaps } from '@/lib/location';

type LiveContextValue = {
  chatId: string;
  myUid: string;
  live: Chat['live'];
  nameOf: (uid: string) => string;
  openMap: () => void;
};

/** Live shares of the open chat, for the location bubbles inside the message list. */
export const LiveLocationContext = createContext<LiveContextValue | null>(null);

export const LIVE_DURATIONS = [
  { label: '15 minutes', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '8 hours', minutes: 480 },
] as const;

function formatLeft(ms: number) {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 60) return `${min} min left`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min left` : `${h} h left`;
}

function formatAgo(at: LiveLocation['at'], now: number) {
  const s = Math.max(0, Math.round((now - (at?.toMillis() ?? now)) / 1000));
  if (s < 45) return 'updated just now';
  const m = Math.round(s / 60);
  return m < 60 ? `updated ${m} min ago` : `updated ${Math.round(m / 60)} h ago`;
}

export function stopSharing(chatId: string, uid: string) {
  stopTracking(chatId);
  haptics.light();
  stopLiveLocation(chatId, uid).then(
    () => toast.success('Stopped sharing location', 'location.slash.fill'),
    () => toast.error('Could not stop sharing. Check your connection.')
  );
}

/** "Live location" bubble: map at the latest position, time left, Stop for the sender. */
export function LiveLocationContent({ message, mine, onLongPress }: {
  message: Message;
  mine: boolean;
  onLongPress?: () => void;
}) {
  const theme = useTheme();
  const ctx = use(LiveLocationContext);
  const now = useNow(15_000);
  const entry = ctx?.live?.[message.senderId];
  // This message's share (a newer share by the same person replaces it).
  const current = entry && entry.messageId === message.id ? entry : null;
  const until = current?.until?.toMillis() ?? message.liveUntil?.toMillis() ?? 0;
  const running = until > now && (!!current || !ctx);
  const lat = current?.lat ?? message.lat ?? 0;
  const lng = current?.lng ?? message.lng ?? 0;
  const color = colorsFor(message.senderId)[1];
  const name = ctx?.nameOf(message.senderId) ?? '';
  const fg = mine ? '#fff' : theme.text;
  const sub = mine ? 'rgba(255,255,255,0.78)' : theme.textSecondary;

  return (
    <View style={styles.bubble}>
      <Pressable
        onPress={() => (running && ctx ? ctx.openMap() : openInMaps(lat, lng))}
        onLongPress={onLongPress}
        delayLongPress={280}
        accessibilityRole="button"
        accessibilityLabel={running ? 'Live location. Show map' : 'Live location ended. Open in Maps'}>
        <MapTiles
          width={240}
          height={130}
          maxZoom={16}
          points={[{ key: 'p', lat, lng, marker: <PersonMarker color={color} label={name} live={running} /> }]}
        />
      </Pressable>
      <View style={[styles.body, { backgroundColor: mine ? 'rgba(255,255,255,0.14)' : 'rgba(127,127,127,0.14)' }]}>
        <View style={styles.titleRow}>
          {running ? <View style={styles.liveDot} /> : null}
          <Text style={[styles.title, { color: fg }]}>{running ? 'Live location' : 'Live location ended'}</Text>
        </View>
        <Text style={[styles.sub, { color: sub }]} numberOfLines={1}>
          {running ? `${formatLeft(until - now)} · ${formatAgo(current?.at ?? null, now)}` : 'Tap to open the last position in Maps'}
        </Text>
        {running && mine && ctx ? (
          <Pressable
            onPress={() => stopSharing(ctx.chatId, ctx.myUid)}
            accessibilityRole="button"
            style={styles.stop}>
            <Text style={styles.stopText}>Stop sharing</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Bar under the header while anyone in the chat is sharing live. */
export function LiveBar({ chat, myUid, nameOf, onPress }: {
  chat: Chat | null;
  myUid: string;
  nameOf: (uid: string) => string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const now = useNow(30_000);
  const sharers = (chat?.members ?? []).filter((uid) => activeLive(chat, uid, now));
  if (!sharers.length) return null;
  const others = sharers.filter((uid) => uid !== myUid);
  const label =
    others.length && sharers.includes(myUid)
      ? `You and ${nameOf(others[0])} are sharing live locations`
      : others.length
        ? `${nameOf(others[0])} is sharing live location`
        : 'You are sharing your live location';
  const until = Math.min(...sharers.map((uid) => chat!.live![uid]!.until.toMillis()));
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Show map`}
        style={[styles.bar, { backgroundColor: theme.glassCard, borderColor: '#34C75966' }]}>
        <View style={styles.barIcon}>
          <Icon name="location.fill" size={13} color="#fff" fallback="📍" />
        </View>
        <Text style={[styles.barText, { color: theme.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.barLeft, { color: theme.textSecondary }]}>{formatLeft(until - now).replace(' left', '')}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Bigger map with everyone sharing in this chat. */
export function LiveMapSheet({ chat, myUid, nameOf, onClose }: {
  chat: Chat | null;
  myUid: string;
  nameOf: (uid: string) => string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const now = useNow(10_000);
  const sharers = (chat?.members ?? [])
    .map((uid) => ({ uid, live: activeLive(chat, uid, now) }))
    .filter((s): s is { uid: string; live: LiveLocation } => !!s.live);
  const points: MapPoint[] = sharers.map((s) => ({
    key: s.uid,
    lat: s.live.lat,
    lng: s.live.lng,
    marker: <PersonMarker color={colorsFor(s.uid)[1]} label={nameOf(s.uid)} live />,
  }));
  const mapWidth = Math.min(width, 600) - 32;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.springify().damping(20)}
        style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[styles.grabber, { backgroundColor: theme.separator }]} />
        <Text style={[styles.sheetTitle, { color: theme.text }]}>Live location</Text>
        {points.length ? (
          <View style={styles.bigMap}>
            <MapTiles points={points} width={mapWidth} height={300} maxZoom={17} />
          </View>
        ) : (
          <Text style={[styles.sub, { color: theme.textSecondary }]}>Nobody is sharing right now.</Text>
        )}
        {sharers.map((s) => {
          const mine = s.uid === myUid;
          return (
            <View key={s.uid} style={[styles.row, { borderTopColor: theme.separator }]}>
              <View style={[styles.rowDot, { backgroundColor: colorsFor(s.uid)[1] }]} />
              <View style={styles.flex}>
                <Text style={[styles.rowName, { color: theme.text }]}>{mine ? 'You' : nameOf(s.uid)}</Text>
                <Text style={[styles.sub, { color: theme.textSecondary }]}>
                  {formatLeft(s.live.until.toMillis() - now)} · {formatAgo(s.live.at, now)}
                </Text>
              </View>
              {mine ? (
                <Pressable
                  onPress={() => {
                    stopSharing(chat!.id, myUid);
                    if (sharers.length === 1) onClose();
                  }}
                  hitSlop={6}
                  accessibilityRole="button"
                  style={[styles.pill, { backgroundColor: '#FF3B3022' }]}>
                  <Text style={[styles.pillText, { color: '#FF3B30' }]}>Stop</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => openInMaps(s.live.lat, s.live.lng)}
                  hitSlop={6}
                  accessibilityRole="button"
                  style={[styles.pill, { backgroundColor: `${theme.accent}22` }]}>
                  <Text style={[styles.pillText, { color: theme.accent }]}>Directions</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          Positions update while iChat is open on each phone.
        </Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bubble: { width: 240, borderRadius: 16, overflow: 'hidden' },
  body: { paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' },
  title: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12 },
  stop: {
    marginTop: 6,
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,59,48,0.9)',
  },
  stopText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 6,
    paddingHorizontal: 10,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
  },
  barIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barText: { flex: 1, fontSize: 14, fontWeight: '600' },
  barLeft: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
    alignItems: 'stretch',
  },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3 },
  sheetTitle: { fontSize: 20, fontWeight: '700' },
  bigMap: { alignSelf: 'center', borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  rowDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
  rowName: { fontSize: 16, fontWeight: '600' },
  pill: { paddingHorizontal: 14, height: 32, borderRadius: 16, justifyContent: 'center' },
  pillText: { fontSize: 14, fontWeight: '700' },
  note: { fontSize: 12, textAlign: 'center' },
});
