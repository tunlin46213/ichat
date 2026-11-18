import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/*
 * Unsent text per chat, kept on this phone. The composer saves as you type; the chat
 * list shows "Draft: …" and the chat opens with the text still there.
 */

const STORAGE_KEY = 'ichat.drafts.v1';
const MAX_LENGTH = 4000;

let drafts: Record<string, string> = {};
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

AsyncStorage.getItem(STORAGE_KEY).then(
  (raw) => {
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      const clean: Record<string, string> = {};
      for (const [key, value] of Object.entries(saved)) {
        if (typeof value === 'string' && value.trim()) clean[key] = value.slice(0, MAX_LENGTH);
      }
      // Anything typed before storage loaded wins.
      drafts = { ...clean, ...drafts };
      emit();
    } catch {
      // Corrupt value: start empty.
    }
  },
  () => {}
);

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(drafts)).catch(() => {});
  }, 400);
}

export function getDraft(chatId: string) {
  return drafts[chatId] ?? '';
}

/** Saves (or, with blank text, clears) the draft for a chat. */
export function setDraft(chatId: string, text: string) {
  const value = text.trim() ? text.slice(0, MAX_LENGTH) : '';
  if ((drafts[chatId] ?? '') === value) return;
  const next = { ...drafts };
  if (value) next[chatId] = value;
  else delete next[chatId];
  drafts = next;
  emit();
  persist();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** All drafts (chatId → text), re-rendering when any changes. */
export function useDrafts() {
  return useSyncExternalStore(
    subscribe,
    () => drafts,
    () => drafts
  );
}
