import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { PhoneFrame } from '@/components/phone-frame';
import { Accent } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/context/auth';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { user, initializing } = useAuth();

  useEffect(() => {
    if (!initializing) SplashScreen.hideAsync();
  }, [initializing]);

  // Keep the splash screen up until we know whether a saved session exists,
  // so a logged-in user never sees the login screen flash.
  if (initializing) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // On web the JS header defaults to an Android look; match iOS instead.
        ...(Platform.OS === 'web' && {
          headerTitleAlign: 'center',
          headerTintColor: Accent,
          headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        }),
      }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!!user}>
        {/* Tabs (Chats, Settings). Each tab has its own stack with a large-title header. */}
        <Stack.Screen name="(tabs)" />
        {/* Pushed over the tabs, so the tab bar is hidden while chatting. */}
        <Stack.Screen
          name="chat/[id]"
          options={{ headerShown: true, headerBackButtonDisplayMode: 'minimal' }}
        />
        {/* Picker for starting a new chat, shown as an iOS sheet. */}
        <Stack.Screen
          name="users"
          options={{ headerShown: true, presentation: 'modal', title: 'New Chat' }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <PhoneFrame>
            <RootNavigator />
          </PhoneFrame>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
