import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { MapTiles } from '@/components/map-tiles';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration, type Message } from '@/lib/chat';
import { openInMaps } from '@/lib/location';
import { useMomentPhoto } from '@/lib/moments';

import { LiveLocationContent } from './live-location';

/** A moment shared into the chat: its first photo (or its text) and who posted it; tap to open. */
export function MomentShareContent({ message, mine, onLongPress }: {
  message: Message;
  mine: boolean;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const m = message.moment!;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/moment/[id]', params: { id: m.id } })}
      onLongPress={onLongPress}
      delayLongPress={280}
      accessibilityRole="link"
      accessibilityLabel={`${m.authorName}'s moment. Open`}
      style={[
        momentStyles.card,
        { backgroundColor: theme.bubbleIncoming, borderColor: mine ? theme.accent : theme.separator },
      ]}>
      {m.photoId ? <MomentSharePhoto photoId={m.photoId} thumb={m.thumb} count={m.photoCount ?? 1} /> : null}
      <View style={momentStyles.body}>
        <View style={momentStyles.head}>
          <Icon name="photo.stack" size={13} color={theme.accent} fallback="🖼" />
          <Text style={[momentStyles.author, { color: theme.text }]} numberOfLines={1}>
            {`${m.authorName}'s moment`}
          </Text>
        </View>
        {m.text ? (
          <Text style={[momentStyles.text, { color: theme.text }]} numberOfLines={m.photoId ? 2 : 4}>
            {m.text}
          </Text>
        ) : null}
        <Text style={[momentStyles.open, { color: theme.accent }]}>View moment ›</Text>
      </View>
    </Pressable>
  );
}

function MomentSharePhoto({ photoId, thumb, count }: { photoId: string; thumb?: string; count: number }) {
  const theme = useTheme();
  const { uri } = useMomentPhoto(photoId);
  const source = uri ?? (thumb ? `data:image/jpeg;base64,${thumb}` : null);
  return (
    <View style={[momentStyles.photo, { backgroundColor: theme.backgroundElement }]}>
      {source ? (
        <Image source={{ uri: source }} blurRadius={uri ? 0 : 10} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : null}
      {count > 1 ? (
        <View style={momentStyles.count}>
          <Icon name="square.on.square" size={11} color="#fff" fallback="▣" />
          <Text style={momentStyles.countText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

const momentStyles = StyleSheet.create({
  card: { width: 240, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  photo: { width: 240, height: 170 },
  body: { padding: 10, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  author: { flex: 1, fontSize: 13, fontWeight: '700' },
  text: { fontSize: 14, lineHeight: 19 },
  open: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  count: {
    position: 'absolute',
    right: 8,
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 7,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  countText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

/** Call log entry: "Voice call · 3:24" or "Missed video call", tap to call back. */
export function CallContent({ message, mine, onCallBack }: {
  message: Message;
  mine: boolean;
  onCallBack: (video: boolean) => void;
}) {
  const theme = useTheme();
  const video = message.callType === 'video';
  const missed = message.callStatus === 'missed';
  const kind = video ? 'Video call' : 'Voice call';
  const title = missed ? (mine ? `${kind} · No answer` : `Missed ${kind.toLowerCase()}`) : kind;
  const fg = mine ? '#fff' : theme.text;
  const sub = mine ? 'rgba(255,255,255,0.75)' : theme.textSecondary;
  return (
    <Pressable
      onPress={() => onCallBack(video)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. Tap to call back`}
      style={styles.call}>
      <View
        style={[
          styles.callIcon,
          { backgroundColor: missed ? '#FF3B30' : mine ? 'rgba(255,255,255,0.22)' : 'rgba(127,127,127,0.2)' },
        ]}>
        <Icon
          name={video ? 'video.fill' : 'phone.fill'}
          size={16}
          color={missed ? '#fff' : fg}
          fallback={video ? '📹' : '📞'}
        />
      </View>
      <View style={styles.callText}>
        <Text style={[styles.callTitle, { color: fg }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.callSub, { color: sub }]} numberOfLines={1}>
          {missed ? 'Tap to call back' : formatDuration(message.durationMs ?? 0)}
        </Text>
      </View>
    </Pressable>
  );
}

/** Shared location: map card that opens Apple Maps (live shares have their own bubble). */
export function LocationContent({ message, mine, onLongPress }: {
  message: Message;
  mine: boolean;
  /** the bubble's menu: the inner Pressable takes the touch, so it must forward this */
  onLongPress: () => void;
}) {
  if (message.liveUntil) return <LiveLocationContent message={message} mine={mine} onLongPress={onLongPress} />;
  return <StaticLocation message={message} mine={mine} onLongPress={onLongPress} />;
}

function StaticLocation({ message, mine, onLongPress }: { message: Message; mine: boolean; onLongPress: () => void }) {
  const theme = useTheme();
  const lat = message.lat ?? 0;
  const lng = message.lng ?? 0;
  return (
    <Pressable
      onPress={() => openInMaps(lat, lng)}
      onLongPress={onLongPress}
      delayLongPress={280}
      accessibilityRole="link"
      accessibilityLabel="Shared location. Open in Maps"
      style={styles.location}>
      <MapTiles
        width={230}
        height={120}
        points={[
          {
            key: 'pin',
            lat,
            lng,
            marker: (
              <View style={styles.pin}>
                <Icon name="mappin.circle.fill" size={34} color="#FF3B30" fallback="📍" />
              </View>
            ),
          },
        ]}
      />
      <View style={[styles.locationBody, { backgroundColor: mine ? 'rgba(255,255,255,0.14)' : 'rgba(127,127,127,0.14)' }]}>
        <Text style={[styles.locationTitle, { color: mine ? '#fff' : theme.text }]}>Shared location</Text>
        <Text
          style={[styles.locationSub, { color: mine ? 'rgba(255,255,255,0.75)' : theme.textSecondary }]}
          numberOfLines={1}>
          {lat.toFixed(5)}, {lng.toFixed(5)} · Open in Maps
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  call: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2, minWidth: 170 },
  callIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  callText: { flexShrink: 1 },
  callTitle: { fontSize: 16, fontWeight: '600' },
  callSub: { fontSize: 13, marginTop: 1, fontVariant: ['tabular-nums'] },
  location: { width: 230, borderRadius: 16, overflow: 'hidden' },
  pin: { boxShadow: '0 2px 4px rgba(0,0,0,0.25)', borderRadius: 17 },
  locationBody: { paddingHorizontal: 10, paddingVertical: 8 },
  locationTitle: { fontSize: 15, fontWeight: '600' },
  locationSub: { fontSize: 12, marginTop: 1 },
});
