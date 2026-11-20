import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Elevation, Radius, Spacing } from '@/constants/theme';
import {
  BUBBLE_COLORS,
  COLOR_MODES,
  TEXT_SIZES,
  useAppearance,
  wallpaperGradient,
  WALLPAPERS,
  type ColorMode,
} from '@/context/appearance';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

/** Bubble color and chat wallpaper, with a live preview. Saved on this phone only. */
export default function AppearanceScreen() {
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const {
    bubble,
    wallpaper,
    bubbleColor,
    setBubble,
    setWallpaper,
    colorMode,
    setColorMode,
    textSize,
    setTextSize,
    textScale,
  } = useAppearance();
  const sizeIndex = TEXT_SIZES.findIndex((t) => t.id === textSize);
  const background = wallpaperGradient(wallpaper, scheme, { accent: bubbleColor, hour: new Date().getHours() });

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
          <Text style={[styles.bubbleText, { color: theme.text, fontSize: 16 * textScale, lineHeight: 21 * textScale }]}>
            How does it look? 👀
          </Text>
        </View>
        <View style={[styles.bubble, styles.mine, { backgroundColor: bubbleColor }]}>
          <Text style={[styles.bubbleText, styles.white, { fontSize: 16 * textScale, lineHeight: 21 * textScale }]}>
            Looks great! ✨
          </Text>
        </View>
      </View>

      <Text style={[styles.header, { color: theme.textSecondary }]}>THEME</Text>
      <View style={[styles.card, styles.modes, { backgroundColor: theme.card }]}>
        {COLOR_MODES.map((mode) => (
          <ModeTile
            key={mode}
            mode={mode}
            selected={mode === colorMode}
            accent={bubbleColor}
            onPress={() => {
              haptics.selection();
              setColorMode(mode);
            }}
          />
        ))}
      </View>

      <Text style={[styles.header, { color: theme.textSecondary }]}>TEXT SIZE</Text>
      <View style={[styles.card, styles.sizeCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.sizeSmall, { color: theme.textSecondary }]}>A</Text>
        <View style={styles.sizeTrack}>
          <View style={[styles.sizeLine, { backgroundColor: theme.separator }]} />
          {TEXT_SIZES.map((t, i) => {
            const selected = t.id === textSize;
            return (
              <Pressable
                key={t.id}
                onPress={() => {
                  haptics.selection();
                  setTextSize(t.id);
                }}
                hitSlop={10}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Text size ${t.label}`}
                style={styles.sizeStop}>
                <View
                  style={[
                    styles.sizeDot,
                    { backgroundColor: i <= sizeIndex ? bubbleColor : theme.separator },
                    selected && [styles.sizeDotOn, { borderColor: bubbleColor, backgroundColor: theme.card }],
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.sizeLarge, { color: theme.textSecondary }]}>A</Text>
      </View>

      <Text style={[styles.header, { color: theme.textSecondary }]}>ACCENT COLOR</Text>
      <View style={[styles.card, styles.swatches, { backgroundColor: theme.card }]}>
        {BUBBLE_COLORS.map((c) => {
          const selected = c.id === bubble;
          return (
            // Fixed quarter-width cells: an even grid, also on the last row.
            <View key={c.id} style={styles.swatchCell}>
            <Pressable
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
            </View>
          );
        })}
      </View>

      <Text style={[styles.header, { color: theme.textSecondary }]}>CHAT WALLPAPER</Text>
      <View style={[styles.card, styles.wallpapers, { backgroundColor: theme.card }]}>
        {WALLPAPERS.map((w) => {
          const selected = w.id === wallpaper;
          const gradient = wallpaperGradient(w.id, scheme, { accent: bubbleColor, hour: new Date().getHours() });
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
        The accent color is used for your bubbles, buttons and links. Only you see these
        settings. Wallpapers follow light and dark mode.
      </Text>
    </ScrollView>
  );
}

const MODE_INFO: Record<ColorMode, { label: string; bg: string; fg: string; split?: boolean }> = {
  system: { label: 'System', bg: '#FFFFFF', fg: '#1C1C1E', split: true },
  light: { label: 'Light', bg: '#FFFFFF', fg: '#E9E9EB' },
  dark: { label: 'Dark', bg: '#000000', fg: '#2C2C2E' },
};

/** Little phone mock-up for Light / Dark / System. */
function ModeTile({ mode, selected, accent, onPress }: {
  mode: ColorMode;
  selected: boolean;
  accent: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const info = MODE_INFO[mode];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={info.label}
      style={styles.modeItem}>
      <View
        style={[
          styles.modePhone,
          { borderColor: selected ? accent : theme.separator, backgroundColor: info.bg },
          selected && styles.modeSelected,
          info.split ? { backgroundImage: 'linear-gradient(90deg, #FFFFFF 50%, #000000 50%)' } : null,
        ]}>
        <View style={[styles.modeBar, { backgroundColor: info.split ? '#C7C7CC' : info.fg }]} />
        <View style={[styles.modeBar, styles.modeBarShort, { backgroundColor: accent }]} />
        <View style={[styles.modeBar, { backgroundColor: info.split ? '#8E8E93' : info.fg }]} />
      </View>
      <Text style={[styles.modeLabel, { color: selected ? accent : theme.text }]}>{info.label}</Text>
      <View style={[styles.radio, { borderColor: selected ? accent : theme.separator }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: accent }]} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: Spacing.three },
  modeItem: { alignItems: 'center', gap: 8, width: '30%' },
  modePhone: {
    width: 64,
    height: 104,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 8,
    gap: 6,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  modeSelected: { borderWidth: 3 },
  modeBar: { height: 9, borderRadius: 5, width: '80%' },
  modeBarShort: { width: '55%', alignSelf: 'flex-end' },
  modeLabel: { fontSize: 14, fontWeight: '600' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  sizeCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sizeSmall: { fontSize: 13, fontWeight: '600' },
  sizeLarge: { fontSize: 22, fontWeight: '600' },
  sizeTrack: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 30 },
  sizeLine: { position: 'absolute', left: 6, right: 6, height: 2, borderRadius: 1 },
  sizeStop: { width: 24, height: 30, alignItems: 'center', justifyContent: 'center' },
  sizeDot: { width: 10, height: 10, borderRadius: 5 },
  sizeDotOn: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' },
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
  card: { borderRadius: Radius.md, boxShadow: Elevation.card, padding: Spacing.three },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  swatchCell: { width: '25%', alignItems: 'center' },
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
