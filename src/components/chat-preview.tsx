import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icon';

type Parsed = { icon: IconName; fallback: string; label: string; danger?: boolean } | null;

/**
 * Chat previews are stored as text like "📷 Photo" or "🎤 Voice message (0:07)"
 * (see previewFor in lib/chat.ts). Turn the emoji prefix into a proper icon.
 */
function parse(text: string): Parsed {
  // Match only the exact previews the app writes, so a typed message that happens to
  // start with 📷 or 📞 stays plain text.
  if (text === '📷 Photo') return { icon: 'camera.fill', fallback: '📷', label: 'Photo' };
  if (text === '📍 Location') return { icon: 'location.fill', fallback: '📍', label: 'Location' };
  if (text === '📍 Live location') return { icon: 'location.fill', fallback: '📍', label: 'Live location' };
  const voice = text.match(/^🎤 Voice message(?: \((\d+:\d\d(?::\d\d)?)\))?$/);
  if (voice) {
    return {
      icon: 'mic.fill',
      fallback: '🎤',
      label: voice[1] ? `Voice message · ${voice[1]}` : 'Voice message',
    };
  }
  const call = text.match(/^(📞|📹) ((?:Missed (?:voice|video) call)|(?:(?:Voice|Video) call · [\d:]+))$/);
  if (call) {
    const video = call[1] === '📹';
    return {
      icon: video ? 'video.fill' : 'phone.fill',
      fallback: call[1],
      label: call[2],
      danger: call[2].startsWith('Missed'),
    };
  }
  return null;
}

/** One-line chat preview with an icon for photos, voice, location and calls. */
export function ChatPreview({ text, color, style, numberOfLines = 2 }: {
  text: string;
  color: string;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
}) {
  const parsed = parse(text);
  if (!parsed) {
    const unsent = text === 'Message unsent';
    return (
      <Text style={[style, { color }, unsent && styles.unsent]} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }
  const tint = parsed.danger ? '#FF3B30' : color;
  return (
    <View style={styles.row}>
      <Icon name={parsed.icon} size={14} color={tint} fallback={parsed.fallback} />
      <Text style={[style, { color: tint }]} numberOfLines={1}>
        {parsed.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  unsent: { fontStyle: 'italic' },
});
