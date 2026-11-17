import { useState, type ComponentType, type ReactNode } from 'react';

import { callsSupported } from '@/lib/runtime';

type StreamModule = typeof import('./stream-calls');

/**
 * iOS/Android: loads the Stream Video SDK only in a development/production build.
 * The SDK touches native WebRTC as soon as it is imported, which would crash
 * Expo Go, so it is required lazily instead of imported at the top.
 */
export function CallsProvider({ children }: { children: ReactNode }) {
  const [Provider] = useState<ComponentType<{ children: ReactNode }> | null>(() =>
    callsSupported
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require('./stream-calls') as StreamModule).StreamCallsProvider
      : null
  );
  if (!Provider) return children;
  return <Provider>{children}</Provider>;
}
