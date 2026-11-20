import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, View } from 'react-native';

import { AuroraBackground } from '@/components/aurora';
import { HeaderAction } from '@/components/header-action';
import { Icon } from '@/components/icon';
import { ListMessage } from '@/components/list-states';
import { MomentCard } from '@/components/moments/moment-card';
import { ScalePressable } from '@/components/scale-pressable';
import { LargeTitleHeader } from '@/components/web-header';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useBlocks } from '@/context/blocks';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import { markMomentsSeen, useMomentsFeed } from '@/lib/moments';

const PAGE = 15;

/** Moments: posts with photos that stay, with likes and comments (newest first). */
export default function MomentsScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const myUid = user!.uid;
  const { blocked } = useBlocks();
  const [count, setCount] = useState(PAGE);
  const feed = useMomentsFeed(true, count);
  const now = useNow(60_000);
  const moments = (feed?.moments ?? []).filter((m) => !blocked.includes(m.authorId));
  const profiles = useUserProfiles([myUid, ...moments.flatMap((m) => [m.authorId, ...Object.keys(m.likes ?? {})])]);

  // Seeing the feed clears the "new moments" dot on the tab.
  const newestId = feed?.moments[0]?.id;
  useEffect(() => {
    markMomentsSeen();
  }, [newestId]);

  const compose = () => router.push('/moment/new' as Href);

  return (
    <>
      {Platform.OS !== 'web' ? (
        <HeaderAction placement="right" icon="square.and.pencil" label="New moment" bold onPress={compose} />
      ) : null}
      <AuroraBackground />
      <FlatList
        style={styles.transparent}
        data={moments}
        keyExtractor={(m) => m.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {/* Web only (native has the system large title); it brings its own side padding. */}
            <View style={styles.webHeader}>
              <LargeTitleHeader title="Moments" action={{ icon: 'square.and.pencil', label: 'New moment', onPress: compose }} />
            </View>
            <ScalePressable
              onPress={compose}
              accessibilityRole="button"
              style={[styles.composeBar, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}>
              <Icon name="camera.fill" size={18} color={theme.accent} fallback="📷" />
              <Text style={[styles.composeText, { color: theme.textSecondary }]}>Share a moment…</Text>
            </ScalePressable>
          </>
        }
        renderItem={({ item }) => (
          <MomentCard
            moment={item}
            myUid={myUid}
            profiles={profiles}
            now={now}
            onOpen={() => router.push({ pathname: '/moment/[id]', params: { id: item.id } })}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListEmptyComponent={
          !feed ? (
            <ActivityIndicator style={styles.loading} />
          ) : feed.error ? (
            <ListMessage error={feed.error === 'permission-denied' ? 'Moments aren’t switched on yet. The admin needs to publish the latest database rules.' : `Could not load moments (${feed.error}).`} />
          ) : (
            <ListMessage empty={'No moments yet.\nShare a photo or a thought with everyone.'} />
          )
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => feed && feed.moments.length >= count && setCount((n) => n + PAGE)}
        ListFooterComponent={feed && feed.moments.length >= count ? <ActivityIndicator style={styles.more} /> : undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  transparent: { backgroundColor: 'transparent' },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six },
  webHeader: { marginHorizontal: -Spacing.three },
  composeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.three,
  },
  composeText: { fontSize: 16 },
  gap: { height: Spacing.three },
  loading: { marginTop: Spacing.five },
  more: { marginVertical: Spacing.three },
});
