import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { MapTiles } from '@/components/map-tiles';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration, type Message } from '@/lib/chat';
import { openInMaps } from '@/lib/location';

import { LiveLocationContent } from './live-location';

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
