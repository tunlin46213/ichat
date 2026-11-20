import { onSnapshot } from 'firebase/firestore';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/context/auth';
import { useBlocks } from '@/context/blocks';
import { useNow } from '@/hooks/use-now';
import { useStoryPrefs } from '@/lib/story-prefs';
import { activeStoriesQuery, cleanUpMyStories, isExpired, seenBy, type Story } from '@/lib/stories';

export type StoryGroup = {
  ownerId: string;
  /** oldest first, the order they play in */
  stories: Story[];
  /** I haven't seen at least one of them */
  unseen: boolean;
  latestAt: number;
};

type StoriesValue = {
  /** my own live stories, oldest first */
  mine: Story[];
  /** other people's, unseen first then newest */
  others: StoryGroup[];
  groupFor: (ownerId: string) => StoryGroup | null;
  /** the first list has arrived (before that, "no stories" just means "not loaded yet") */
  loaded: boolean;
};

const StoriesContext = createContext<StoriesValue>({ mine: [], others: [], groupFor: () => null, loaded: false });

/** One live subscription to everyone's stories from the last 24 hours. */
export function StoriesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { blocked } = useBlocks();
  const myUid = user?.uid;
  // Tagged with the uid so another account never sees the previous one's list.
  const [state, setState] = useState<{ uid: string; stories: Story[] } | null>(null);
  // Drop stories as they turn 24 hours old, even without a new snapshot.
  const now = useNow(60_000);
  // People whose stories I muted: their ring disappears; their chat stays.
  const muted = useStoryPrefs(myUid)?.mutedStories ?? [];

  useEffect(() => {
    if (!myUid) return;
    cleanUpMyStories(myUid).catch(() => {});
    return onSnapshot(
      activeStoriesQuery(),
      (snap) =>
        setState({
          uid: myUid,
          stories: snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Story),
        }),
      (err) => console.warn('Could not load stories', err.code)
    );
  }, [myUid]);

  const live =
    state && state.uid === myUid
      ? state.stories
          .filter(
            (s) => s.expiresAt && !isExpired(s, now) && !blocked.includes(s.ownerId) && !muted.includes(s.ownerId)
          )
          .sort((a, b) => (a.createdAt?.toMillis() ?? now) - (b.createdAt?.toMillis() ?? now))
      : [];

  const byOwner = new Map<string, Story[]>();
  for (const story of live) {
    if (story.ownerId === myUid) continue;
    byOwner.set(story.ownerId, [...(byOwner.get(story.ownerId) ?? []), story]);
  }
  const others: StoryGroup[] = [...byOwner.entries()]
    .map(([ownerId, stories]) => ({
      ownerId,
      stories,
      unseen: stories.some((s) => !seenBy(s, myUid ?? '')),
      latestAt: stories[stories.length - 1].createdAt?.toMillis() ?? now,
    }))
    .sort((a, b) => Number(b.unseen) - Number(a.unseen) || b.latestAt - a.latestAt);
  const mine = live.filter((s) => s.ownerId === myUid);

  function groupFor(ownerId: string): StoryGroup | null {
    if (ownerId === myUid) {
      return mine.length
        ? { ownerId, stories: mine, unseen: false, latestAt: mine[mine.length - 1].createdAt?.toMillis() ?? now }
        : null;
    }
    return others.find((g) => g.ownerId === ownerId) ?? null;
  }

  const loaded = !!state && state.uid === myUid;
  return <StoriesContext value={{ mine, others, groupFor, loaded }}>{children}</StoriesContext>;
}

export function useStories() {
  return use(StoriesContext);
}
