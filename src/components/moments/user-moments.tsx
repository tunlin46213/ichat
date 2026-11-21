import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { gradientFor } from '@/components/moments/moment-card';
import { useTheme } from '@/hooks/use-theme';
import { useMomentPhoto, type Moment } from '@/lib/moments';

const SHOW = 9;
const GAP = 4;

/** A person's moments as a 3-column grid (profile → Moments tab). */
export function UserMomentsGrid({ moments }: { moments: Moment[] }) {
  const [width, setWidth] = useState(0);
  const [all, setAll] = useState(false);
  const theme = useTheme();
  if (!moments.length) return null;
  const shown = all ? moments : moments.slice(0, SHOW);
  const tile = width ? Math.floor((width - GAP * 2) / 3) : 0;
  return (
    <>
      <View
        onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
        style={styles.grid}>
        {tile
          ? shown.map((m) => <Tile key={m.id} moment={m} size={tile} />)
          : null}
      </View>
      {moments.length > SHOW && !all ? (
        <Pressable onPress={() => setAll(true)} accessibilityRole="button" style={styles.more}>
          <Text style={[styles.moreText, { color: theme.accent }]}>Show all {moments.length}</Text>
        </Pressable>
      ) : null}
    </>
  );
}

function Tile({ moment, size }: { moment: Moment; size: number }) {
  const theme = useTheme();
  const photo = moment.photos?.[0];
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/moment/[id]', params: { id: moment.id } })}
      accessibilityRole="button"
      accessibilityLabel={photo ? 'Photo moment. Open' : `Moment: ${moment.text ?? ''}`}
      style={[styles.tile, { width: size, height: size, backgroundColor: theme.backgroundElement }]}>
      {photo ? (
        <TilePhoto id={photo.id} thumb={photo.thumb} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.text, { backgroundImage: gradientFor(moment.id) }]}>
          <Text style={styles.textInner} numberOfLines={4}>
            {moment.text}
          </Text>
        </View>
      )}
      {(moment.photos?.length ?? 0) > 1 ? (
        <View style={styles.multi}>
          <Icon name="square.on.square" size={12} color="#fff" fallback="▣" />
        </View>
      ) : null}
    </Pressable>
  );
}

function TilePhoto({ id, thumb }: { id: string; thumb?: string }) {
  const { uri } = useMomentPhoto(id);
  const source = uri ?? (thumb ? `data:image/jpeg;base64,${thumb}` : null);
  return source ? (
    <Image source={{ uri: source }} blurRadius={uri ? 0 : 8} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
  ) : null;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { overflow: 'hidden', borderRadius: 10 },
  text: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  textInner: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  multi: { position: 'absolute', top: 6, right: 6 },
  more: { alignSelf: 'center', paddingVertical: 8 },
  moreText: { fontSize: 15, fontWeight: '600' },
});
