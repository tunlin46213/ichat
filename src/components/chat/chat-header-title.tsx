import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Header center: small avatar over the name, with "typing…" / presence underneath. */
export function ChatHeaderTitle({ id, name, status, typing, online, avatarUrl }: {
  id: string;
  name: string;
  status: string;
  typing: boolean;
  online: boolean;
  avatarUrl?: string | null;
}) {
  const theme = useTheme();
  const subtitle = typing ? 'typing…' : status;
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <Avatar id={id} name={name} size={30} online={online} uri={avatarUrl} />
      <View style={styles.text}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.status, { color: typing || online ? Accent : theme.textSecondary }]}
            numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 240 },
  text: { flexShrink: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  status: { fontSize: 12 },
});
