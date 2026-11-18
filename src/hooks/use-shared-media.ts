import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { firstUrl } from '@/components/chat/linkified-text';
import type { Message } from '@/lib/chat';
import { db } from '@/lib/firebase';

/** How many recent messages to scan for shared photos, voice notes and links. */
const SCAN = 300;

export type SharedLink = { url: string; message: Message };

export type SharedMedia = {
  loading: boolean;
  /** newest first */
  photos: Message[];
  voice: Message[];
  links: SharedLink[];
};

/**
 * Photos, voice messages and links from a chat's recent history. One read when the
 * contact sheet opens (no index needed: filtered on the device).
 */
export function useSharedMedia(chatId: string | null, hiddenBefore: number): SharedMedia {
  const [state, setState] = useState<{ key: string; messages: Message[] } | null>(null);
  const key = chatId ?? '';

  useEffect(() => {
    if (!chatId) return;
    let active = true;
    getDocs(query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(SCAN))).then(
      (snap) => {
        if (!active) return;
        setState({
          key: chatId,
          messages: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message),
        });
      },
      () => active && setState({ key: chatId, messages: [] })
    );
    return () => {
      active = false;
    };
  }, [chatId]);

  const messages = (state?.key === key ? state.messages : []).filter(
    (m) => !m.deleted && (!hiddenBefore || (m.createdAt?.toMillis() ?? Infinity) > hiddenBefore)
  );
  const links: SharedLink[] = [];
  for (const m of messages) {
    if ((m.type ?? 'text') !== 'text') continue;
    const url = firstUrl(m.text);
    if (url) links.push({ url, message: m });
  }
  return {
    loading: !!chatId && state?.key !== key,
    photos: messages.filter((m) => m.type === 'image' && m.mediaId),
    voice: messages.filter((m) => m.type === 'audio' && m.mediaId),
    links,
  };
}
