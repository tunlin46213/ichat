import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { useSyncExternalStore } from 'react';

import { db } from '@/lib/firebase';
import { buildTime, pushWorkerUrl as builtInWorkerUrl } from '@/lib/runtime';

/**
 * Settings that can change without a new build: Firestore `config/app`, edited only in
 * the Firebase console (rules block writes from the app).
 *
 *   pushWorkerUrl   https://….workers.dev  — move the worker without breaking installed apps
 *   minBuildTime    unix seconds          — builds committed before this show "Update iChat"
 *   updateMessage   text for that banner
 */
export type RemoteConfig = { pushWorkerUrl?: string; minBuildTime?: number; updateMessage?: string };

const STORE_KEY = 'ichat.remoteConfig.v1';
let config: RemoteConfig = {};
const listeners = new Set<() => void>();

function set(next: RemoteConfig) {
  config = next;
  listeners.forEach((l) => l());
}

/** Keep only well-formed values; a typo in the console must not break the app. */
function clean(data: Record<string, unknown>): RemoteConfig {
  const url = typeof data.pushWorkerUrl === 'string' ? data.pushWorkerUrl.trim() : '';
  return {
    pushWorkerUrl: /^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(url) ? url.replace(/\/$/, '') : undefined,
    minBuildTime: typeof data.minBuildTime === 'number' && data.minBuildTime > 0 ? data.minBuildTime : undefined,
    updateMessage:
      typeof data.updateMessage === 'string' && data.updateMessage.trim() ? data.updateMessage.trim() : undefined,
  };
}

// Last known values, so a cold start without network still uses the moved worker.
let fetched = false;
AsyncStorage.getItem(STORE_KEY)
  .then((saved) => {
    if (saved && !fetched) set(clean(JSON.parse(saved)));
  })
  .catch(() => {});

/** Re-reads config/app. Call after sign-in and when the app comes back to the front. */
export async function refreshRemoteConfig() {
  try {
    const snap = await getDoc(doc(db, 'config', 'app'));
    if (!snap.exists()) return;
    const next = clean(snap.data());
    fetched = true;
    set(next);
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    // Offline, or rules not published yet: keep what we have.
  }
}

/** The worker to call: from config/app, else the one built into this app. */
export function workerUrl() {
  return (config.pushWorkerUrl ?? builtInWorkerUrl ?? '').replace(/\/$/, '') || null;
}

/** True when this build is older than config/app.minBuildTime. */
export function updateRequired(c: RemoteConfig = config) {
  return !!buildTime && !!c.minBuildTime && buildTime < c.minBuildTime;
}

export function useRemoteConfig() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => config
  );
}
