import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const PHONE_WIDTH = 430; // iPhone Pro Max logical width
const PHONE_HEIGHT = 932;
const STATUS_BAR = 54;
const HOME_INDICATOR = 21;

// Screens inside the frame lay out as if on a real iPhone: the status bar is
// drawn above them, and the home indicator area is reported as a bottom inset.
const FRAME_INSETS = { top: 0, bottom: HOME_INDICATOR, left: 0, right: 0 };

/**
 * In a desktop browser, shows the app inside an iPhone-shaped frame (status bar,
 * Dynamic Island, home indicator) so it looks like it does on the phone.
 * On a narrow (mobile) browser it fills the screen.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const dark = useColorScheme() === 'dark';
  const framed = width > PHONE_WIDTH + 40 && height > 640;

  if (!framed) return <View style={styles.fill}>{children}</View>;

  const fg = dark ? '#fff' : '#000';
  const screenBg = dark ? '#000' : '#fff';

  return (
    <View style={[styles.backdrop, { backgroundColor: dark ? '#0B0B0D' : '#D9DAE0' }]}>
      <View
        style={[
          styles.phone,
          {
            height: Math.min(PHONE_HEIGHT, height - 40),
            borderColor: dark ? '#2C2C2E' : '#1C1C1E',
            backgroundColor: screenBg,
          },
        ]}>
        <View style={[styles.statusBar, { backgroundColor: screenBg }]}>
          <Text style={[styles.clock, { color: fg }]}>9:41</Text>
          <View style={styles.island} />
          <View style={styles.statusIcons}>
            <Ionicons name="cellular" size={16} color={fg} />
            <Ionicons name="wifi" size={16} color={fg} />
            <Ionicons name="battery-full" size={24} color={fg} />
          </View>
        </View>

        <SafeAreaInsetsContext.Provider value={FRAME_INSETS}>
          <View style={styles.fill}>{children}</View>
        </SafeAreaInsetsContext.Provider>

        <View pointerEvents="none" style={styles.homeIndicatorWrap}>
          <View style={[styles.homeIndicator, { backgroundColor: fg }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phone: {
    width: PHONE_WIDTH,
    borderRadius: 56,
    borderWidth: 11,
    overflow: 'hidden',
    boxShadow: '0 30px 80px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.06)',
  },
  statusBar: {
    height: STATUS_BAR,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    paddingTop: 6,
  },
  clock: { fontSize: 16, fontWeight: '600', width: 70 },
  island: {
    position: 'absolute',
    top: 11,
    left: '50%',
    marginLeft: -62,
    width: 124,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000',
  },
  statusIcons: { flexDirection: 'row', alignItems: 'center', gap: 5, width: 70, justifyContent: 'flex-end' },
  homeIndicatorWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    alignItems: 'center',
  },
  homeIndicator: { width: 140, height: 5, borderRadius: 3, opacity: 0.9 },
});
