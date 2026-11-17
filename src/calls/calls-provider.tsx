import type { ReactNode } from 'react';

/**
 * Web (and fallback): no voice calls. The iOS/Android version lives in
 * calls-provider.native.tsx.
 */
export function CallsProvider({ children }: { children: ReactNode }) {
  return children;
}
