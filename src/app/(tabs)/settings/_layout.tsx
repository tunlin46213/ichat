import { router, Stack, type Href } from 'expo-router';
import { Platform } from 'react-native';

import { WebBackButton } from '@/components/web-header';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        // Web has no system back button: draw iOS's "‹ Settings" on the sub-pages.
        ...(Platform.OS === 'web' && {
          headerLeft: () => (
            <WebBackButton
              label="Settings"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings' as Href))}
            />
          ),
        }),
      }}>
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
      <Stack.Screen name="storage" options={{ title: 'Storage' }} />
      <Stack.Screen name="quiet-hours" options={{ title: 'Alert Options' }} />
      <Stack.Screen name="story-archive" options={{ title: 'Story Archive' }} />
    </Stack>
  );
}
