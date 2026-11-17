import { createContext, use } from 'react';

export type CallsContextValue = {
  /** Starts a ringing audio call. null when calls are unavailable on this runtime. */
  startCall: ((other: { id: string; name: string }) => Promise<void>) | null;
};

export const CallsContext = createContext<CallsContextValue>({ startCall: null });

export function useCalls() {
  return use(CallsContext);
}
