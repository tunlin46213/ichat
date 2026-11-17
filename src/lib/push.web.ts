// Web / PWA push (Firebase Cloud Messaging). Native builds use push.ts (Expo push).
import { arrayRemove, arrayUnion, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';

import { app, db } from '@/lib/firebase';
import { webPushVapidKey } from '@/lib/runtime';

export type ChatNotificationData = { chatId: string; otherId: string; name: string };
export type WebPushState = 'unsupported' | 'needs-install' | 'off' | 'denied' | 'on';

const SW_PATH = '/firebase-messaging-sw.js';
const tokensDoc = (uid: string) => doc(db, 'users', uid, 'private', 'push');
let registeredToken: string | null = null;

export function setActiveChat(_chatId: string | null) {
  // The service worker shows every web push (iOS requires it), so nothing to track.
}

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Opened from the home screen icon (required for web push on iPhone). */
export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function getWebPushState(): WebPushState {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!webPushVapidKey) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && registeredToken ? 'on' : 'off';
}

/**
 * Asks for permission and saves this browser's FCM token. On iPhone this must be
 * called from a tap (Apple requires a user gesture) and only works from the
 * home-screen app.
 */
export async function enableWebPush(uid: string): Promise<WebPushState> {
  const state = getWebPushState();
  if (state === 'unsupported' || state === 'needs-install' || !webPushVapidKey) return state;
  if (!(await isSupported())) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const registration = await navigator.serviceWorker.register(SW_PATH);
  const token = await getToken(getMessaging(app), {
    vapidKey: webPushVapidKey,
    serviceWorkerRegistration: registration,
  });
  registeredToken = token;
  await setDoc(
    tokensDoc(uid),
    { fcmTokens: arrayUnion(token), updatedAt: serverTimestamp() },
    { merge: true }
  );
  return 'on';
}

/** Re-registers silently at startup when permission was already granted. */
export async function registerForPush(uid: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  await enableWebPush(uid).catch(() => {});
}

export async function unregisterPush(uid: string) {
  if (!registeredToken) return;
  await setDoc(tokensDoc(uid), { fcmTokens: arrayRemove(registeredToken) }, { merge: true }).catch(
    () => {}
  );
  registeredToken = null;
}

/** App-icon badge on the home-screen app (iOS 16.4+, Chrome desktop). */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) nav.setAppBadge?.(count).catch(() => {});
  else nav.clearAppBadge?.().catch(() => {});
}
