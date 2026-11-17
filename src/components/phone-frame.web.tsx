import type { ReactNode } from 'react';
import { StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';

const PHONE_WIDTH = 430; // iPhone Pro Max logical width
const PHONE_HEIGHT = 932;

/**
 * In a desktop browser, shows the app inside an iPhone-sized rounded frame so it
 * looks like it does on the phone. On a narrow (mobile) browser it fills the screen.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const dark = useColorScheme() === 'dark';
  const framed = width > PHONE_WIDTH + 40 && height > 600;

  if (!framed) return <View style={styles.fill}>{children}</View>;

  return (
    <View style={[styles.backdrop, { backgroundColor: dark ? '#0B0B0D' : '#D9DAE0' }]}>
      <View
        style={[
          styles.phone,
          {
            height: Math.min(PHONE_HEIGHT, height - 40),
            borderColor: dark ? '#2C2C2E' : '#1C1C1E',
          },
        ]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phone: {
    width: PHONE_WIDTH,
    borderRadius: 52,
    borderWidth: 10,
    overflow: 'hidden',
    boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
  },
});
