import { ScrollView, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { ScalePressable } from '@/components/scale-pressable';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

/** One-tap reply suggestions shown above the composer. */
export function SmartReplies({ replies, onPick }: { replies: string[]; onPick: (text: string) => void }) {
  const theme = useTheme();
  if (!replies.length) return null;
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOut.duration(120)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.row}
        accessibilityLabel="Suggested replies">
        {replies.map((reply) => (
          <ScalePressable
            key={reply}
            onPress={() => {
              haptics.light();
              onPick(reply);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Reply: ${reply}`}
            style={[
              styles.chip,
              { backgroundColor: theme.glassCard, borderColor: `${theme.accent}55`, boxShadow: `0 2px 10px ${theme.accent}22` },
            ]}>
            <Text style={[styles.text, { color: theme.accent }]} numberOfLines={1}>
              {reply}
            </Text>
          </ScalePressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  chip: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: Radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  text: { fontSize: 15, fontWeight: '600' },
});
