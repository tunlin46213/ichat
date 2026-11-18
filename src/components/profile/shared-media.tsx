import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AudioContent, useMediaUri } from '@/components/chat/media-content';
import { PhotoViewer } from '@/components/chat/photo-viewer';
import { Icon } from '@/components/icon';
import { Elevation, Radius, Spacing } from '@/constants/theme';
import { useAppearance } from '@/context/appearance';
import { useTheme } from '@/hooks/use-theme';
import type { SharedMedia } from '@/hooks/use-shared-media';
import { formatChatTime, formatDuration, type Message } from '@/lib/chat';
import { haptics } from '@/lib/haptics';

type Tab = 'photos' | 'voice' | 'links';

/** Photos are full-size base64 docs, so only load a screenful until asked for more. */
const PHOTO_PAGE = 24;

/** Photos / Voice / Links shared in a chat, with a segmented control on top. */
export function SharedMediaSection({ chatId, media, senderName }: {
  chatId: string;
  media: SharedMedia;
  senderName: (uid: string) => string;
}) {
  const theme = useTheme();
  const { bubbleColor } = useAppearance();
  const [tab, setTab] = useState<Tab>('photos');
  const [shown, setShown] = useState(PHOTO_PAGE);
  const [voiceShown, setVoiceShown] = useState(3);
  const [viewer, setViewer] = useState<number | null>(null);
  // The viewer swipes forward in time, so give it oldest first.
  const viewerPhotos = [...media.photos].reverse();

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'photos', label: 'Photos', count: media.photos.length },
    { id: 'voice', label: 'Voice', count: media.voice.length },
    { id: 'links', label: 'Links', count: media.links.length },
  ];

  return (
    <View style={[styles.card, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}>
      <View style={[styles.segments, { backgroundColor: theme.backgroundElement }]}>
        {tabs.map((t) => {
          const selected = t.id === tab;
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                haptics.selection();
                setTab(t.id);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.segment, selected && [styles.segmentOn, { backgroundColor: theme.card }]]}>
              <Text style={[styles.segmentText, { color: selected ? theme.text : theme.textSecondary }]}>
                {t.label}
                {t.count ? ` ${t.count}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {media.loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : tab === 'photos' ? (
        media.photos.length ? (
          <>
            <View style={styles.grid}>
              {media.photos.slice(0, shown).map((m, i) => (
                <Thumb
                  key={m.id}
                  chatId={chatId}
                  message={m}
                  onPress={() => setViewer(media.photos.length - 1 - i)}
                />
              ))}
            </View>
            {media.photos.length > shown ? (
              <Pressable onPress={() => setShown((n) => n + PHOTO_PAGE)} style={styles.more}>
                <Text style={[styles.moreText, { color: bubbleColor }]}>
                  Show more ({media.photos.length - shown})
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Empty icon="photo.on.rectangle" text="No photos yet" />
        )
      ) : tab === 'voice' ? (
        media.voice.length ? (
          <>
          {media.voice.slice(0, voiceShown).map((m, i) => (
            <View
              key={m.id}
              style={[styles.voiceRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator }]}>
              <View style={[styles.voiceBubble, { backgroundColor: theme.bubbleIncoming }]}>
                <AudioContent
                  chatId={chatId}
                  mediaId={m.mediaId!}
                  mime={m.mime ?? 'audio/mp4'}
                  durationMs={m.durationMs}
                  waveform={m.waveform}
                  mine={false}
                />
              </View>
              <Text style={[styles.meta, { color: theme.textSecondary }]}>
                {senderName(m.senderId)} · {formatChatTime(m.createdAt)}
                {m.durationMs ? ` · ${formatDuration(m.durationMs)}` : ''}
              </Text>
            </View>
          ))}
          {media.voice.length > voiceShown ? (
            <Pressable onPress={() => setVoiceShown(media.voice.length)} style={styles.more}>
              <Text style={[styles.moreText, { color: bubbleColor }]}>Show all ({media.voice.length})</Text>
            </Pressable>
          ) : null}
          </>
        ) : (
          <Empty icon="mic.fill" text="No voice messages yet" />
        )
      ) : media.links.length ? (
        media.links.map(({ url, message }, i) => (
          <Pressable
            key={message.id}
            onPress={() => Linking.openURL(url).catch(() => {})}
            accessibilityRole="link"
            style={({ pressed }) => [
              styles.linkRow,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator },
              pressed && { opacity: 0.6 },
            ]}>
            <View style={[styles.linkIcon, { backgroundColor: `${bubbleColor}22` }]}>
              <Icon name="link" size={16} color={bubbleColor} fallback="🔗" />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.linkHost, { color: theme.text }]} numberOfLines={1}>
                {hostOf(url)}
              </Text>
              <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                {url}
              </Text>
            </View>
            <Text style={[styles.meta, { color: theme.textSecondary }]}>{formatChatTime(message.createdAt)}</Text>
          </Pressable>
        ))
      ) : (
        <Empty icon="link" text="No links yet" />
      )}

      {viewer !== null ? (
        <PhotoViewer
          chatId={chatId}
          photos={viewerPhotos}
          startIndex={Math.min(viewer, viewerPhotos.length - 1)}
          senderName={senderName}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </View>
  );
}

function hostOf(url: string) {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0];
}

function Thumb({ chatId, message, onPress }: { chatId: string; message: Message; onPress: () => void }) {
  const theme = useTheme();
  const { uri, failed } = useMediaUri(chatId, message.mediaId ?? '', message.mime ?? 'image/jpeg');
  return (
    <Pressable
      onPress={() => uri && onPress()}
      accessibilityLabel="Photo, tap to view"
      style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
      {uri ? (
        <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Animated.View>
      ) : failed ? (
        <Icon name="photo" size={18} color={theme.textSecondary} fallback="🖼" />
      ) : (
        <ActivityIndicator size="small" />
      )}
    </Pressable>
  );
}

function Empty({ icon, text }: { icon: 'photo.on.rectangle' | 'mic.fill' | 'link'; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={26} color={theme.textSecondary} fallback="" />
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, boxShadow: Elevation.card, padding: Spacing.two, overflow: 'hidden' },
  segments: { flexDirection: 'row', borderRadius: 9, padding: 2, marginBottom: Spacing.two },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 30, borderRadius: 7 },
  segmentOn: { boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
  segmentText: { fontSize: 13, fontWeight: '600' },
  loading: { marginVertical: Spacing.four },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  thumb: {
    width: '32.6%',
    aspectRatio: 1,
    borderRadius: 6,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: { alignItems: 'center', paddingVertical: 12 },
  moreText: { fontSize: 15, fontWeight: '600' },
  voiceRow: { paddingVertical: 8, paddingHorizontal: 4, gap: 4 },
  voiceBubble: { alignSelf: 'flex-start', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  meta: { fontSize: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 4 },
  linkIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  linkHost: { fontSize: 15, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: Spacing.four },
  emptyText: { fontSize: 14 },
});
