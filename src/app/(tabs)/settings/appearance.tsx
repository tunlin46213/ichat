import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Spacing } from '@/constants/theme';
import {
  BUBBLE_COLORS,
  useAppearance,
  wallpaperGradient,
  WALLPAPERS,
} from '@/context/appearance';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

/** Bubble color and chat wallpaper, with a live preview. Saved on this phone only. */
export default function AppearanceScreen() {
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { bubble, wallpaper, bubbleColor, setBubble, setWallpaper } = useAppearance();
  const background = wallpaperGradient(wallpaper, scheme);

  return (
    <ScrollView
      style={{ backgroundColor: theme.groupedBackground }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      {/* Live preview */}
      <View
        style={[
          styles.preview,
          { backgroundColor: theme.background },
          background ? { backgroundImage: background } : null,
        ]}>
        <View style={[styles.bubble, styles.theirs, { backgroundColor: theme.bubbleIncoming }]}>
          <Text style={[styles.bubbleText, { color: theme.text }]}>How does it look? 👀</Text>
        </View>
        <View style={[styles.bubble, styles.mine, { backgroundColor: bubbleColor }]}>
          <Text style={[styles.bubbleText, styles.white]}>Looks great! ✨</Text>
        </View>
      </View>

      <Text style={[styles.header, { color: theme.textSecondary }]}>BUBBLE COLOR</Text>
      <View style={[styles.card, styles.swatches, { backgroundColor: theme.card }]}>
        {BUBBLE_COLORS.map((c) => {
          const selected = c.id === bubble;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                haptics.light();
                setBubble(c.id);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={c.name}
              style={[styles.swatchRing, selected && { borderColor: c.color }]}>
              <View style={[styles.swatch, { backgroundColor: c.color }]}>
                {selected ? (
                  <Animated.View entering={ZoomIn.springify()}>
                    <Icon name="checkmark" size={16} color="#fff" fallback="✓" />
                  </Animated.View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.header, { color: theme.textSecondary }]}>CHAT WALLPAPER</Text>
      <View style={[styles.card, styles.wallpapers, { backgroundColor: theme.card }]}>
        {WALLPAPERS.map((w) => {
          const selected = w.id === wallpaper;
          const gradient = wallpaperGradient(w.id, scheme);
          return (
            <Pressable
              key={w.id}
              onPress={() => {
                haptics.light();
                setWallpaper(w.id);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={w.name}
              style={styles.wallpaperItem}>
              <View
                style={[
                  styles.wallpaper,
                  { backgroundColor: theme.background, borderColor: selected ? bubbleColor : theme.separator },
                  selected && styles.wallpaperSelected,
                  gradient ? { backgroundImage: gradient } : null,
                ]}>
                <View style={[styles.miniBubble, { backgroundColor: theme.bubbleIncoming }]} />
                <View style={[styles.miniBubble, styles.miniMine, { backgroundColor: bubbleColor }]} />
              </View>
              <Text style={[styles.wallpaperName, { color: selected ? bubbleColor : theme.textSecondary }]}>
                {w.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.footer, { color: theme.textSecondary }]}>
        Only you see these. Wallpapers follow light and dark mode.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  preview: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: 8,
    overflow: 'hidden',
    minHeight: 130,
    justifyContent: 'center',
  },
  bubble: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, maxWidth: '75%' },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 5 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 5 },
  bubbleText: { fontSize: 16 },
  white: { color: '#fff' },
  header: { fontSize: 13, marginTop: Spacing.four, marginBottom: 6, marginLeft: Spacing.three },
  card: { borderRadius: 12, padding: Spacing.three },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  swatchRing: { padding: 3, borderRadius: 24, borderWidth: 2, borderColor: 'transparent' },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  wallpapers: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  wallpaperItem: { width: '30%', flexGrow: 1, alignItems: 'center', gap: 6 },
  wallpaper: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    gap: 6,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  wallpaperSelected: { borderWidth: 3 },
  miniBubble: { height: 12, width: '60%', borderRadius: 6 },
  miniMine: { alignSelf: 'flex-end' },
  wallpaperName: { fontSize: 13, fontWeight: '500' },
  footer: { fontSize: 13, lineHeight: 18, marginTop: 8, marginHorizontal: Spacing.three },
});
