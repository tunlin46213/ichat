import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Settings',
          headerLargeTitleEnabled: true,
          headerTransparent: Platform.OS === 'ios',
          headerBlurEffect: 'systemChromeMaterial',
          // Web draws its own iOS-style large title (LargeTitleHeader) inside the screen.
          headerShown: Platform.OS !== 'web',
        }}
      />
      <Stack.Screen name="blocked" options={{ title: 'Blocked Users' }} />
      <Stack.Screen name="appearance" options={{ title: 'Appearance' }} />
      <Stack.Screen name="starred" options={{ title: 'Starred Messages' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
    </Stack>
  );
}
