import type { ReactNode } from 'react';

import type { IconName } from '@/components/icon';

/**
 * Web-only stand-ins for iOS header features (large title, header search bar).
 * On iOS/Android the native header already provides them, so these render nothing.
 * See web-header.web.tsx for the browser versions.
 */
export function LargeTitleHeader(_props: {
  title: string;
  leading?: ReactNode;
  action?: { icon: IconName; label: string; onPress: () => void };
  search?: { value: string; onChangeText: (text: string) => void; placeholder?: string };
}) {
  return null;
}

export function InlineSearch(_props: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  return null;
}

export function WebBackButton(_props: { label: string; onPress: () => void }) {
  return null;
}
