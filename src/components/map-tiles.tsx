import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * A small real map with no API key: OpenStreetMap raster tiles laid out around the
 * points, plus a marker per point. Tiles are drawn at half size (128 pt) so they stay
 * sharp on Retina screens.
 */
const TILE = 128;
const MAX_ZOOM = 18;
const MIN_ZOOM = 2;

export type MapPoint = { key: string; lat: number; lng: number; marker: ReactNode };

/** Position on the zoom-`z` world map, in points. */
function project(lat: number, lng: number, z: number) {
  const size = TILE * 2 ** z;
  const sin = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/** Closest zoom that still fits every point inside the box (with room for markers). */
function fitZoom(points: MapPoint[], width: number, height: number, maxZoom: number) {
  for (let z = maxZoom; z > MIN_ZOOM; z--) {
    const p = points.map((pt) => project(pt.lat, pt.lng, z));
    const w = Math.max(...p.map((q) => q.x)) - Math.min(...p.map((q) => q.x));
    const h = Math.max(...p.map((q) => q.y)) - Math.min(...p.map((q) => q.y));
    if (w <= width - 80 && h <= height - 80) return z;
  }
  return MIN_ZOOM;
}

export function MapTiles({ points, width, height, maxZoom = 16 }: {
  points: MapPoint[];
  width: number;
  height: number;
  maxZoom?: number;
}) {
  if (!points.length) return null;
  const z = fitZoom(points, width, height, Math.min(maxZoom, MAX_ZOOM));
  const projected = points.map((pt) => ({ ...pt, ...project(pt.lat, pt.lng, z) }));
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  // Top-left corner of the visible box on the world map.
  const left = (Math.min(...xs) + Math.max(...xs)) / 2 - width / 2;
  const top = (Math.min(...ys) + Math.max(...ys)) / 2 - height / 2;
  const count = 2 ** z;
  const tiles: { key: string; uri: string; x: number; y: number }[] = [];
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
      const wrapped = ((tx % count) + count) % count;
      tiles.push({
        key: `${z}/${tx}/${ty}`,
        uri: `https://tile.openstreetmap.org/${z}/${wrapped}/${ty}.png`,
        x: tx * TILE - left,
        y: ty * TILE - top,
      });
    }
  }

  return (
    <View style={[styles.map, { width, height }]} pointerEvents="none">
      {tiles.map((t) => (
        <Image
          key={t.key}
          source={{ uri: t.uri }}
          cachePolicy="disk"
          transition={150}
          style={[styles.tile, { left: t.x, top: t.y }]}
        />
      ))}
      {projected.map((p) => (
        <View key={p.key} style={[styles.marker, { left: p.x - left, top: p.y - top }]}>
          {p.marker}
        </View>
      ))}
      <Text style={styles.credit}>© OpenStreetMap</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    overflow: 'hidden',
    // Shown while tiles load, or offline.
    backgroundColor: '#E3EEDB',
    backgroundImage: 'linear-gradient(135deg, #E3EEDB 0%, #CFE3F1 100%)',
  },
  tile: { position: 'absolute', width: TILE, height: TILE },
  // Zero-size anchor exactly on the point; markers center themselves on it.
  marker: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  credit: {
    position: 'absolute',
    right: 4,
    bottom: 2,
    fontSize: 8,
    color: 'rgba(0,0,0,0.55)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 3,
    borderRadius: 3,
  },
});

/** Round avatar-style dot for a person on the map. */
export function PersonMarker({ color, label, live }: { color: string; label: string; live?: boolean }) {
  return (
    <View style={styles2.wrap}>
      {live ? <View style={[styles2.halo, { backgroundColor: `${color}40` }]} /> : null}
      <View style={[styles2.dot, { backgroundColor: color }]}>
        <Text style={styles2.initial}>{label.slice(0, 1).toUpperCase()}</Text>
      </View>
    </View>
  );
}

const styles2 = StyleSheet.create({
  wrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 56, height: 56, borderRadius: 28 },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
  },
  initial: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
