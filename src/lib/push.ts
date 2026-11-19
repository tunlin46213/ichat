import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
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
  if (Platform.OS === 'android') return registerAndroid(uid);
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

/**
 * Android: the phone's own FCM token (free, no Expo/EAS account). The push worker sends
 * to it directly with Firebase Cloud Messaging, so alerts come from iChat itself.
 */
async function registerAndroid(uid: string) {
  if (!Device.isDevice) return;
  try {
    // Channels decide sound / importance. Calls get their own, louder one.
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#208AEF',
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    });
    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Calls',
      importance: AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 800, 400, 800, 400, 800, 400, 800],
      bypassDnd: false,
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || !token) return;
    registeredAndroidToken = token;
    await setDoc(
      tokensDoc(uid),
      { androidTokens: arrayUnion(token), updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    console.warn('Android push registration failed', err);
  }
}

let registeredAndroidToken: string | null = null;

/** Call before signing out so this device stops receiving the user's messages. */
export async function unregisterPush(uid: string) {
  if (registeredAndroidToken) {
    await setDoc(tokensDoc(uid), { androidTokens: arrayRemove(registeredAndroidToken) }, { merge: true }).catch(
      () => {}
    );
    registeredAndroidToken = null;
  }
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

export type ChatNotificationData = {
  chatId: string;
  otherId: string;
  name: string;
  /** Android call alert: the Stream call to ring when tapped */
  call?: string;
};

export type WebPushState = 'unsupported' | 'needs-install' | 'off' | 'denied' | 'on';

/** Web only (see push.web.ts); native builds register automatically at sign-in. */
export function getWebPushState(): WebPushState {
  return 'unsupported';
}

/** Web only (see push.web.ts). */
export async function enableWebPush(_uid: string): Promise<WebPushState> {
  return 'unsupported';
}
