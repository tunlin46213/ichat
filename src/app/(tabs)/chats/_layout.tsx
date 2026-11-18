import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function ChatsLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerShadowVisible: false,
        // Let the aurora glow show behind the large title; blur once content scrolls under it.
        headerTransparent: Platform.OS === 'ios',
        headerBlurEffect: 'systemChromeMaterial',
        // Web draws its own iOS-style large title (LargeTitleHeader) inside the screen.
        headerShown: Platform.OS !== 'web',
      }}>
      <Stack.Screen name="index" options={{ title: 'Chats' }} />
    </Stack>
  );
}
