import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { useAppearance } from '@/context/appearance';
import { useAuth } from '@/context/auth';
import { useBlocks } from '@/context/blocks';
import { useChats } from '@/context/chats';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfile } from '@/hooks/use-user-profile';
import { otherMemberId, type Chat } from '@/lib/chat';
import { haptics } from '@/lib/haptics';
import { getActiveChat } from '@/lib/push';

const SHOW_MS = 4000;

let chime: AudioPlayer | null = null;
function playChime() {
  try {
    chime ??= createAudioPlayer(require('../../assets/sounds/message.wav'));
    chime.seekTo(0);
    chime.play();
  } catch {
    // No audio (e.g. the browser blocked autoplay): the banner still shows.
  }
}

type Banner = { key: number; chatId: string; otherId: string; name: string; text: string };

/**
 * iOS-style banner + chime for messages that arrive while the app is open but the
 * chat isn't on screen. Free Apple IDs can't receive push notifications, so this is
 * the only alert the sideloaded app gets.
 */
export function InAppBanner() {
  const { user } = useAuth();
  const { onIncoming } = useChats();
  const { blocked } = useBlocks();
  const [banner, setBanner] = useState<Banner | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myUid = user?.uid;
  // Read through a ref so changing a mute doesn't resubscribe.
  const { chatPrefs } = useAppearance();
  const prefsRef = useRef(chatPrefs);
  useEffect(() => {
    prefsRef.current = chatPrefs;
  });

  useEffect(() => {
    if (!myUid) return;
    const unsubscribe = onIncoming((chat: Chat) => {
      const otherId = otherMemberId(chat, myUid);
      if (chat.id === getActiveChat() || blocked.includes(otherId)) return;
      if (prefsRef.current(chat.id).muted) return;
      if ((chat.unread?.[myUid] ?? 0) === 0) return; // already read on another device
      setBanner({
        key: Date.now(),
        chatId: chat.id,
        otherId,
        name: chat.names?.[otherId] ?? 'New message',
        text: chat.lastMessage ?? '',
      });
      haptics.light();
      playChime();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setBanner(null), SHOW_MS);
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [myUid, onIncoming, blocked]);

  if (!banner) return null;
  return (
    <BannerCard
      key={banner.key}
      banner={banner}
      onPress={() => {
        setBanner(null);
        router.push({
          pathname: '/chat/[id]',
          params: { id: banner.chatId, otherId: banner.otherId, name: banner.name },
        });
      }}
    />
  );
}

function BannerCard({ banner, onPress }: { banner: Banner; onPress: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useUserProfile(banner.otherId);
  return (
    <Animated.View
      entering={SlideInUp.springify().damping(18)}
      exiting={SlideOutUp.duration(200)}
      style={[styles.wrap, { top: insets.top + 6 }]}
      pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`New message from ${banner.name}: ${banner.text}`}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.card, opacity: pressed ? 0.85 : 1 },
        ]}>
        <Avatar id={banner.otherId} name={profile?.name ?? banner.name} size={40} uri={profile?.avatarUrl} />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {profile?.name ?? banner.name}
            </Text>
            <Text style={[styles.now, { color: theme.textSecondary }]}>now</Text>
          </View>
          <Text style={[styles.text, { color: theme.text }]} numberOfLines={2}>
            {banner.text}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 8, right: 8, zIndex: 900 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 22,
    boxShadow: '0 8px 30px rgba(0,0,0,0.28)',
  },
  body: { flex: 1, gap: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 15, fontWeight: '600' },
  now: { fontSize: 13 },
  text: { fontSize: 15, lineHeight: 20 },
});
