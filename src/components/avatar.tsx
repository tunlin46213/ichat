import { StyleSheet, Text, View } from 'react-native';

const palette = ['#208AEF', '#30A46C', '#E5484D', '#8E4EC6', '#F76B15', '#12A594', '#D6409F'];

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

/** Colored circle with the first letter of the name (photo avatars come in a later phase). */
export function Avatar({ id, name, size = 48 }: { id: string; name: string; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(id) },
      ]}>
      <Text style={[styles.text, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '600' },
});
