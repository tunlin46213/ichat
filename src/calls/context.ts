import { createContext, use } from 'react';

export type CallsContextValue = {
  /** Starts a ringing voice (default) or video call. null when calls are unavailable here. */
  startCall:
    | ((other: { id: string; name: string }, options?: { video?: boolean }) => Promise<void>)
    | null;
};

export const CallsContext = createContext<CallsContextValue>({ startCall: null });

export function useCalls() {
  return use(CallsContext);
}
