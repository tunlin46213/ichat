import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration, type Message } from '@/lib/chat';
import { openInMaps } from '@/lib/location';

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

/** Shared location: map-style card that opens Apple Maps. */
export function LocationContent({ message, mine }: { message: Message; mine: boolean }) {
  const theme = useTheme();
  const lat = message.lat ?? 0;
  const lng = message.lng ?? 0;
  return (
    <Pressable
      onPress={() => openInMaps(lat, lng)}
      accessibilityRole="link"
      accessibilityLabel="Shared location. Open in Maps"
      style={styles.location}>
      <View style={styles.map}>
        {/* Simple street-grid look; no map API key is needed. */}
        <View style={[styles.road, styles.roadH, { top: '35%' }]} />
        <View style={[styles.road, styles.roadH, { top: '72%' }]} />
        <View style={[styles.road, styles.roadV, { left: '28%' }]} />
        <View style={[styles.road, styles.roadV, { left: '70%' }]} />
        <View style={styles.pin}>
          <Icon name="mappin.circle.fill" size={34} color="#FF3B30" fallback="📍" />
        </View>
      </View>
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
  map: {
    height: 120,
    backgroundColor: '#DDE9D5',
    backgroundImage: 'linear-gradient(135deg, #E3EEDB 0%, #CFE3F1 100%)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  road: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.85)' },
  roadH: { left: 0, right: 0, height: 6 },
  roadV: { top: 0, bottom: 0, width: 6 },
  pin: { marginTop: -10 },
  locationBody: { paddingHorizontal: 10, paddingVertical: 8 },
  locationTitle: { fontSize: 15, fontWeight: '600' },
  locationSub: { fontSize: 12, marginTop: 1 },
});
