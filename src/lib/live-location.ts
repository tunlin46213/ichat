import * as Location from 'expo-location';

import { updateLiveLocation } from '@/lib/chat';

/** Fewest milliseconds between two position writes (Firestore free-plan friendly). */
const MIN_WRITE_GAP_MS = 10_000;

type Tracker = {
  uid: string;
  until: number;
  sub: Location.LocationSubscription | null;
  timer: ReturnType<typeof setTimeout>;
  lastWrite: number;
  stopped: boolean;
};

/** chatId → running watcher for my own live share in that chat. */
const trackers = new Map<string, Tracker>();

export function isTracking(chatId: string) {
  return trackers.has(chatId);
}

/**
 * Keeps writing my position to chat.live.{uid} until `until`. Foreground only: iOS
 * pauses it while iChat is in the background (no background-location entitlement on a
 * free Apple ID), and it picks up again when the app comes back.
 */
export function startTracking(chatId: string, uid: string, until: number) {
  const existing = trackers.get(chatId);
  if (existing && existing.uid === uid && existing.until === until) return;
  stopTracking(chatId);
  const delay = until - Date.now();
  if (delay <= 0) return;

  const tracker: Tracker = {
    uid,
    until,
    sub: null,
    lastWrite: 0,
    stopped: false,
    timer: setTimeout(() => stopTracking(chatId), delay),
  };
  trackers.set(chatId, tracker);

  Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, distanceInterval: 15, timeInterval: MIN_WRITE_GAP_MS },
    (pos) => {
      const now = Date.now();
      if (tracker.stopped || now - tracker.lastWrite < MIN_WRITE_GAP_MS) return;
      tracker.lastWrite = now;
      updateLiveLocation(chatId, uid, { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
    }
  ).then(
    (sub) => {
      // Stopped while the watcher was still starting.
      if (tracker.stopped) sub.remove();
      else tracker.sub = sub;
    },
    (err) => {
      console.warn('Live location: could not watch position', err);
      stopTracking(chatId);
    }
  );
}

export function stopTracking(chatId: string) {
  const tracker = trackers.get(chatId);
  if (!tracker) return;
  tracker.stopped = true;
  clearTimeout(tracker.timer);
  tracker.sub?.remove();
  trackers.delete(chatId);
}

/** Stops every watcher that no longer has a running share (`keep` = chatId → until). */
export function syncTrackers(uid: string, keep: Map<string, number>) {
  for (const [chatId, tracker] of trackers) {
    if (tracker.uid !== uid || keep.get(chatId) !== tracker.until) stopTracking(chatId);
  }
  for (const [chatId, until] of keep) startTracking(chatId, uid, until);
}
