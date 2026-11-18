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
          // Web draws its own iOS-style large title (LargeTitleHeader) inside the screen.
          headerShown: Platform.OS !== 'web',
        }}
      />
      <Stack.Screen name="blocked" options={{ title: 'Blocked Users' }} />
      <Stack.Screen name="appearance" options={{ title: 'Appearance' }} />
      <Stack.Screen name="starred" options={{ title: 'Starred Messages' }} />
    </Stack>
  );
}
