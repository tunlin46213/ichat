import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** Running inside the Expo Go app (no custom native code: no calls, limited push). */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** EAS project id, written to app.json by `eas init`. Needed for push tokens. */
export const easProjectId: string | undefined =
  Constants.expoConfig?.extra?.eas?.projectId || undefined;

/** Stream Video public API key (app.json → expo.extra.streamApiKey). */
export const streamApiKey: string | undefined =
  Constants.expoConfig?.extra?.streamApiKey || undefined;

/** Cloudflare Worker that sends push notifications (worker/). Empty = push off. */
export const pushWorkerUrl: string | undefined =
  Constants.expoConfig?.extra?.pushWorkerUrl || undefined;

/** Firebase Cloud Messaging web push public key (Project settings → Cloud Messaging). */
export const webPushVapidKey: string | undefined =
  Constants.expoConfig?.extra?.webPushVapidKey || undefined;

/** Voice calls need a development/production build on a phone. */
export const callsSupported = Platform.OS !== 'web' && !isExpoGo && !!streamApiKey;

export function callsUnavailableReason() {
  if (Platform.OS === 'web') return 'Voice and video calls are available in the iPhone app.';
  if (isExpoGo) return 'Calls need the iChat app build. They are not available in Expo Go.';
  if (!streamApiKey) return 'Calls are not set up yet (missing Stream API key).';
  return null;
}
