import type { ReactNode } from 'react';

/** On iOS/Android the app already fills the phone screen. See phone-frame.web.tsx. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return children;
}
