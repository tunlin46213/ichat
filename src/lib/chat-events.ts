/**
 * Tiny in-memory bus so screens stacked above a chat (e.g. the contact sheet) can
 * ask that chat to do something once they close.
 */
type Listener = (chatId: string) => void;

const searchListeners = new Set<Listener>();

/** The chat screen calls this to hear "open search" requests. */
export function onChatSearchRequest(listener: Listener) {
  searchListeners.add(listener);
  return () => {
    searchListeners.delete(listener);
  };
}

export function requestChatSearch(chatId: string) {
  for (const listener of searchListeners) listener(chatId);
}
