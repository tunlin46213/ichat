import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { CallsProvider } from '@/calls/calls-provider';
import { PhoneFrame } from '@/components/phone-frame';
import { Accent, Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/context/auth';
import { BlocksProvider } from '@/context/blocks';
import type { ChatNotificationData } from '@/lib/push';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const colorScheme = useColorScheme();
  const { user, initializing } = useAuth();

  useEffect(() => {
    if (!initializing) SplashScreen.hideAsync();
  }, [initializing]);

  // Tapping a message notification opens that chat (also when it launched the app).
  const signedIn = !!user;
  useEffect(() => {
    if (Platform.OS === 'web' || !signedIn) return;
    const open = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as Partial<ChatNotificationData>;
      if (!data?.chatId || !data.otherId) return;
      router.push({
        pathname: '/chat/[id]',
        params: { id: data.chatId, otherId: data.otherId, name: data.name ?? '' },
      });
    };
    Notifications.getLastNotificationResponseAsync().then((r) => r && open(r), () => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [signedIn]);

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
          // Tint colors the back button; the title stays the normal text color, as on iOS.
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '600',
            color: Colors[colorScheme === 'dark' ? 'dark' : 'light'].text,
          },
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
        {/* Contact sheet: block / report. */}
        <Stack.Screen
          name="user/[id]"
          options={{ headerShown: true, presentation: 'modal', title: '' }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      {/* Reachable signed in or out (from Register and Settings). */}
      <Stack.Screen
        name="terms"
        options={{ headerShown: true, presentation: 'modal', title: 'Terms of Use' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <BlocksProvider>
            <CallsProvider>
              <PhoneFrame>
                <RootNavigator />
              </PhoneFrame>
            </CallsProvider>
          </BlocksProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
