import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { CallsProvider } from '@/calls/calls-provider';
import { ConnectingScreen } from '@/components/connecting-screen';
import { InAppBanner } from '@/components/in-app-banner';
import { PromptHost } from '@/components/prompt';
import { ToastHost } from '@/components/toast';
import { PhoneFrame } from '@/components/phone-frame';
import { Colors } from '@/constants/theme';
import { AppearanceProvider, useAccent } from '@/context/appearance';
import { AuthProvider, useAuth } from '@/context/auth';
import { BlocksProvider } from '@/context/blocks';
import { ChatsProvider } from '@/context/chats';
import { StoriesProvider } from '@/context/stories';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ChatNotificationData } from '@/lib/push';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const colorScheme = useColorScheme();
  const accent = useAccent();
  const { user, initializing, needsOnboarding } = useAuth();

  // Restoring a saved login asks Google's servers first; on a slow or filtered mobile
  // connection that can hang for up to a minute. Don't sit on the splash that long.
  const [splashTimedOut, setSplashTimedOut] = useState(false);
  useEffect(() => {
    if (!initializing) {
      SplashScreen.hideAsync();
      return;
    }
    const timer = setTimeout(() => {
      setSplashTimedOut(true);
      SplashScreen.hideAsync();
    }, 3000);
    return () => clearTimeout(timer);
  }, [initializing]);

  // Tapping a message notification opens that chat (also when it launched the app).
  const signedIn = !!user;
  useEffect(() => {
    if (Platform.OS === 'web' || !signedIn) return;
    const open = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as Partial<ChatNotificationData>;
      // "Bae liked / commented on your moment": open it.
      if (data?.moment) {
        router.push({ pathname: '/moment/[id]', params: { id: data.moment } });
        return;
      }
      // "Bae posted a story" (Android): play their stories.
      if (data?.story) {
        router.push({ pathname: '/story/[uid]', params: { uid: data.story } });
        return;
      }
      if (!data?.chatId || !data.otherId) return;
      router.push({
        pathname: '/chat/[id]',
        params: {
          id: data.chatId,
          otherId: data.otherId,
          name: data.name ?? '',
          ...(data.call ? { call: data.call } : {}),
        },
      });
    };
    Notifications.getLastNotificationResponseAsync().then((r) => r && open(r), () => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [signedIn]);

  // Keep the splash screen up until we know whether a saved session exists,
  // so a logged-in user never sees the login screen flash.
  if (initializing) return splashTimedOut ? <ConnectingScreen /> : null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // On web the JS header defaults to an Android look; match iOS instead.
        ...(Platform.OS === 'web' && {
          headerTitleAlign: 'center',
          headerTintColor: accent,
          // Tint colors the back button; the title stays the normal text color, as on iOS.
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '600',
            color: Colors[colorScheme === 'dark' ? 'dark' : 'light'].text,
          },
        }),
      }}>
      <Stack.Screen name="index" />
      {/* Welcome steps right after sign-up (photo, name, tips). */}
      <Stack.Protected guard={!!user && needsOnboarding}>
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !needsOnboarding}>
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
        {/* Stories: compose and play, full screen. */}
        <Stack.Screen
          name="story/new"
          options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="story/[uid]"
          options={{ presentation: 'fullScreenModal', animation: 'fade' }}
        />
        {/* Moments: compose (sheet) and one post with its comments. */}
        <Stack.Screen name="moment/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="moment/[id]" options={{ headerBackButtonDisplayMode: 'minimal' }} />
        {/* Contact sheet: block / report. */}
        <Stack.Screen
          name="user/[id]"
          options={{ headerShown: true, presentation: 'modal', title: '' }}
        />
        {/* Web admin dashboard (admins only; the page itself checks config/admins). */}
        <Stack.Screen name="admin" />
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

/** New-message banner, shown above every screen while signed in. */
function SignedInOverlays() {
  const { user, initializing } = useAuth();
  if (initializing || !user) return null;
  return <InAppBanner />;
}

/** Navigation colors follow Settings → Appearance (mode and accent color). */
function NavigationTheme({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const accent = useAccent();
  const base = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  return <ThemeProvider value={{ ...base, colors: { ...base.colors, primary: accent } }}>{children}</ThemeProvider>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AppearanceProvider>
          <NavigationTheme>
            <BlocksProvider>
              {/* Chats live here (not in the tabs) so the in-app banner works on every screen. */}
              <ChatsProvider>
                <StoriesProvider>
                  <CallsProvider>
                    <PhoneFrame>
                      <RootNavigator />
                      <SignedInOverlays />
                      <ToastHost />
                      <PromptHost />
                    </PhoneFrame>
                  </CallsProvider>
                </StoriesProvider>
              </ChatsProvider>
            </BlocksProvider>
          </NavigationTheme>
        </AppearanceProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
