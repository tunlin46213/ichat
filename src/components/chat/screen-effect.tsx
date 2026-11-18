import { useEffect, useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import type { EffectKind } from '@/lib/effects';

const DURATION = 3200;
const CONFETTI_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#0A84FF', '#AF52DE', '#FF2D55'];

/** Stable pseudo-random 0–1 for particle `i` of a burst (render must stay pure). */
function rand(seed: number, i: number, salt = 0) {
  const v = Math.sin(seed * 12.9898 + i * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Plays one full-screen effect over the chat (confetti, hearts, balloons or fireworks),
 * then calls onDone. Touches pass through. Skipped when Reduce Motion is on.
 */
export function ScreenEffect({ kind, seed, onDone }: { kind: EffectKind; seed: number; onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  // The parent re-renders often; keep the timer running across new onDone functions.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (reduce) {
      done.current();
      return;
    }
    haptics.success();
    const timer = setTimeout(() => done.current(), DURATION + 600);
    return () => clearTimeout(timer);
  }, [reduce]);

  if (reduce) return null;
  const count = kind === 'confetti' ? 60 : kind === 'fireworks' ? 54 : 22;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => (
        <Particle key={i} kind={kind} i={i} count={count} seed={seed} width={width} height={height} />
      ))}
    </View>
  );
}

function Particle({ kind, i, count, seed, width, height }: {
  kind: EffectKind;
  i: number;
  count: number;
  seed: number;
  width: number;
  height: number;
}) {
  const t = useSharedValue(0);
  const r1 = rand(seed, i, 1);
  const r2 = rand(seed, i, 2);
  const r3 = rand(seed, i, 3);
  const delay = kind === 'fireworks' ? Math.floor(i / 18) * 650 : r3 * 900;
  const life = kind === 'balloons' ? 3000 : kind === 'fireworks' ? 1300 : 2400;

  useEffect(() => {
    t.set(withDelay(delay, withTiming(1, { duration: life, easing: Easing.out(Easing.quad) })));
  }, [t, delay, life]);

  // Fireworks: three bursts, particles flying out in a circle from each centre.
  const burst = Math.floor(i / 18);
  const angle = ((i % 18) / 18) * Math.PI * 2;
  const cx = width * (0.25 + 0.25 * burst);
  const cy = height * (0.25 + 0.12 * ((burst + seed) % 3));
  const reach = 90 + r1 * 60;
  const startX = r1 * width;
  const sway = (r2 - 0.5) * 80;

  const style = useAnimatedStyle(() => {
    const p = t.get();
    switch (kind) {
      case 'confetti':
        return {
          opacity: p < 0.85 ? 1 : (1 - p) / 0.15,
          transform: [
            { translateX: startX + Math.sin(p * Math.PI * 3 + r2 * 6) * 30 },
            { translateY: -40 + p * (height + 80) },
            { rotate: `${p * (360 + r3 * 540)}deg` },
          ],
        };
      case 'fireworks':
        return {
          opacity: p === 0 ? 0 : 1 - p,
          transform: [
            { translateX: cx + Math.cos(angle) * reach * p },
            { translateY: cy + Math.sin(angle) * reach * p + p * p * 40 },
            { scale: 1 - p * 0.5 },
          ],
        };
      default: {
        // hearts and balloons float up from below the screen
        const rise = kind === 'balloons' ? height + 160 : height * 0.85;
        return {
          opacity: p === 0 ? 0 : p < 0.8 ? 1 : (1 - p) / 0.2,
          transform: [
            { translateX: startX + Math.sin(p * Math.PI * 2 + r2 * 6) * 18 + sway * p },
            { translateY: height + 40 - p * rise },
            { scale: 0.7 + r3 * 0.6 },
          ],
        };
      }
    }
  });

  if (kind === 'confetti') {
    return (
      <Animated.View
        style={[
          styles.piece,
          {
            backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            width: 6 + r3 * 5,
            height: 10 + r1 * 6,
            borderRadius: r2 > 0.6 ? 6 : 1,
          },
          style,
        ]}
      />
    );
  }
  if (kind === 'fireworks') {
    return (
      <Animated.View
        style={[styles.spark, { backgroundColor: CONFETTI_COLORS[(burst * 2 + i) % CONFETTI_COLORS.length] }, style]}
      />
    );
  }
  return (
    <Animated.View style={[styles.emojiWrap, style]}>
      <Text style={kind === 'balloons' ? styles.balloon : styles.heart}>
        {kind === 'balloons' ? ['🎈', '🎈', '🎉', '🎈'][i % 4] : ['❤️', '💕', '💖', '❤️'][i % 4]}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', top: 0, left: 0 },
  spark: { position: 'absolute', top: 0, left: 0, width: 6, height: 6, borderRadius: 3 },
  emojiWrap: { position: 'absolute', top: 0, left: 0 },
  heart: { fontSize: 34 },
  balloon: { fontSize: 52 },
});
