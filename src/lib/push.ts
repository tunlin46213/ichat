import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { arrayRemove, arrayUnion, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { db } from '@/lib/firebase';
import { easProjectId } from '@/lib/runtime';

/** The chat currently on screen; its notifications are not shown as banners. */
let activeChatId: string | null = null;
export function setActiveChat(chatId: string | null) {
  activeChatId = chatId;
}
export function getActiveChat() {
  return activeChatId;
}

// Foreground behaviour: show banners, except for the chat the user is looking at.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const chatId = notification.request.content.data?.chatId;
      const visible = chatId !== activeChatId;
      return {
        shouldShowBanner: visible,
        shouldShowList: visible,
        shouldPlaySound: visible,
        shouldSetBadge: true,
      };
    },
  });
}

let registeredToken: string | null = null;

const tokensDoc = (uid: string) => doc(db, 'users', uid, 'private', 'push');

/**
 * Asks for notification permission and stores this device's Expo push token so the
 * Cloud Function can notify me of new messages. Silently does nothing where push
 * can't work (web, simulators, no EAS project id yet).
 */
export async function registerForPush(uid: string) {
  if (Platform.OS === 'web' || !Device.isDevice || !easProjectId) return;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: easProjectId });
    registeredToken = token;
    await setDoc(
      tokensDoc(uid),
      { tokens: arrayUnion(token), updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    console.warn('Push registration failed', err);
  }
}

/** Call before signing out so this device stops receiving the user's messages. */
export async function unregisterPush(uid: string) {
  if (!registeredToken) return;
  await setDoc(tokensDoc(uid), { tokens: arrayRemove(registeredToken) }, { merge: true }).catch(
    () => {}
  );
  registeredToken = null;
}

/** App-icon badge = total unread messages. */
export function setAppBadge(count: number) {
  if (Platform.OS === 'web') return;
  Notifications.setBadgeCountAsync(count).catch(() => {});
}

export type ChatNotificationData = { chatId: string; otherId: string; name: string };

export type WebPushState = 'unsupported' | 'needs-install' | 'off' | 'denied' | 'on';

/** Web only (see push.web.ts); native builds register automatically at sign-in. */
export function getWebPushState(): WebPushState {
  return 'unsupported';
}

/** Web only (see push.web.ts). */
export async function enableWebPush(_uid: string): Promise<WebPushState> {
  return 'unsupported';
}
