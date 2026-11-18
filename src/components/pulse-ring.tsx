import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * Story-style ring around an avatar. When `active`, a gradient ring with a soft glow
 * that slowly breathes outwards (skipped when the system asks to reduce motion).
 */
export function PulseRing({ size, active, gradient, idleColor, gap, children }: {
  /** outer diameter */
  size: number;
  active: boolean;
  /** CSS gradient for the active ring */
  gradient: string;
  /** ring color when inactive */
  idleColor: string;
  /** color between ring and avatar (the screen background) */
  gap: string;
  children: ReactNode;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(pulse);
      pulse.set(0);
      return;
    }
    pulse.set(
      withRepeat(
        withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }),
        -1,
        false
      )
    );
    return () => cancelAnimation(pulse);
  }, [active, pulse]);

  const glow = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - pulse.get()),
    transform: [{ scale: 1 + pulse.get() * 0.18 }],
  }));

  const ring = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      {active ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: ring, backgroundImage: gradient }, glow]}
        />
      ) : null}
      <View
        style={[
          styles.ring,
          { borderRadius: ring },
          active ? { backgroundImage: gradient } : { backgroundColor: idleColor },
        ]}>
        <View style={[styles.inner, { borderRadius: ring, backgroundColor: gap }]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { flex: 1, padding: 2.5 },
  inner: { flex: 1, padding: 2, alignItems: 'center', justifyContent: 'center' },
});
