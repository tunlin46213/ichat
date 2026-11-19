import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMediaUri } from '@/components/chat/media-content';
import { PhotoViewer } from '@/components/chat/photo-viewer';
import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';
import { formatMessageTime, previewFor, type Message } from '@/lib/chat';
import type { Memory } from '@/lib/memories';

function summary(messages: Message[]) {
  const photos = messages.filter((m) => m.type === 'image').length;
  const firstText = messages.find((m) => (m.type ?? 'text') === 'text' && m.text.trim())?.text;
  const parts = [
    photos ? `${photos} photo${photos > 1 ? 's' : ''}` : '',
    `${messages.length} message${messages.length > 1 ? 's' : ''}`,
  ].filter(Boolean);
  return firstText ? `“${firstText}”` : parts.join(' · ');
}

/** "✨ 1 year ago today" card at the top of the chat; tap to look back. */
export function MemoryCard({ memory, onOpen, onDismiss }: {
  memory: Memory;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const thumbs = memory.messages.filter((m) => m.type === 'image' && m.thumb).slice(0, 3);
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOut.duration(150)}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Memory: ${memory.label}. Show`}
        style={[styles.card, { backgroundColor: theme.glassCard, borderColor: `${theme.accent}55` }]}>
        {thumbs.length ? (
          <View style={[styles.stack, { width: 34 + (thumbs.length - 1) * 12 }]}>
            {thumbs.map((m, i) => (
              <Image
                key={m.id}
                source={{ uri: `data:image/jpeg;base64,${m.thumb}` }}
                blurRadius={1}
                style={[styles.stackThumb, { left: i * 12, zIndex: 3 - i, borderColor: theme.card }]}
              />
            ))}
          </View>
        ) : (
          <View style={[styles.spark, { backgroundColor: `${theme.accent}22` }]}>
            <Icon name="sparkles" size={16} color={theme.accent} fallback="✨" />
          </View>
        )}
        <View style={styles.flex}>
          <Text style={[styles.label, { color: theme.accent }]}>✨ {memory.label}</Text>
          <Text style={[styles.sub, { color: theme.text }]} numberOfLines={1}>
            {summary(memory.messages)}
          </Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide memory">
          <Icon name="xmark" size={13} color={theme.textSecondary} fallback="✕" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

/** The whole day: photo grid on top, then the conversation. */
export function MemorySheet({ chatId, memory, nameOf, onClose }: {
  chatId: string;
  memory: Memory;
  nameOf: (uid: string) => string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [viewer, setViewer] = useState<number | null>(null);
  const photos = memory.messages.filter((m) => m.type === 'image' && m.mediaId);
  const talk = memory.messages.filter((m) => m.type !== 'image');

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.springify().damping(20)}
        style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[styles.grabber, { backgroundColor: theme.separator }]} />
        <Text style={[styles.title, { color: theme.text }]}>✨ {memory.label}</Text>
        <Text style={[styles.date, { color: theme.textSecondary }]}>
          {memory.day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {photos.length ? (
            <View style={styles.grid}>
              {/* Full photos are big base64 docs: a dozen here, the rest by swiping in the viewer. */}
              {photos.slice(0, 12).map((m, i) => (
                <MemoryPhoto key={m.id} chatId={chatId} message={m} onPress={() => setViewer(i)} />
              ))}
            </View>
          ) : null}
          {photos.length > 12 ? (
            <Text style={[styles.who, { color: theme.textSecondary }]}>
              +{photos.length - 12} more photos — open one and swipe
            </Text>
          ) : null}
          {talk.map((m) => (
            <View key={m.id} style={styles.line}>
              <Text style={[styles.who, { color: theme.textSecondary }]}>
                {nameOf(m.senderId)} · {formatMessageTime(m.createdAt)}
              </Text>
              <Text style={[styles.text, { color: theme.text }]}>{previewFor(m)}</Text>
            </View>
          ))}
        </ScrollView>
      </Animated.View>
      {viewer !== null ? (
        <PhotoViewer
          chatId={chatId}
          photos={photos}
          startIndex={viewer}
          senderName={nameOf}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </Modal>
  );
}

function MemoryPhoto({ chatId, message, onPress }: { chatId: string; message: Message; onPress: () => void }) {
  const theme = useTheme();
  const { uri, failed } = useMediaUri(chatId, message.mediaId ?? '', message.mime ?? 'image/jpeg');
  const preview = uri ?? (message.thumb ? `data:image/jpeg;base64,${message.thumb}` : null);
  return (
    <Pressable
      onPress={() => uri && onPress()}
      accessibilityLabel="Photo, tap to view"
      style={[styles.photo, { backgroundColor: theme.backgroundElement }]}>
      {preview ? (
        <Image source={{ uri: preview }} blurRadius={uri ? 0 : 8} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : failed ? (
        <Icon name="photo" size={18} color={theme.textSecondary} fallback="🖼" />
      ) : (
        <ActivityIndicator size="small" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  stack: { height: 34 },
  stackThumb: { position: 'absolute', top: 0, width: 34, height: 34, borderRadius: 9, borderWidth: 2 },
  spark: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  sub: { fontSize: 14, marginTop: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 4,
  },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '700' },
  date: { fontSize: 13, marginBottom: 8 },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: 12, paddingBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  photo: {
    width: '32.6%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: { gap: 2 },
  who: { fontSize: 12, fontWeight: '600' },
  text: { fontSize: 15 },
});
