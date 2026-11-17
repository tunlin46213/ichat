import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Centered spinner, error or empty message for list screens. */
export function ListMessage({ loading, error, empty }: {
  loading?: boolean;
  error?: string | null;
  empty?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Text style={[styles.text, { color: error ? '#E5484D' : theme.textSecondary }]}>
          {error ?? empty}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  text: { fontSize: 16, textAlign: 'center' },
});
