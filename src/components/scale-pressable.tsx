import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

/** Pressable that springs down slightly while pressed, like iOS buttons. */
export function ScalePressable({ style, children, pressedScale = 0.96, ...props }: Omit<
  PressableProps,
  'style' | 'children'
> & {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  pressedScale?: number;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Pressable
      {...props}
      onPressIn={(e) => {
        scale.set(withSpring(pressedScale, SPRING));
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, SPRING));
        props.onPressOut?.(e);
      }}>
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}
