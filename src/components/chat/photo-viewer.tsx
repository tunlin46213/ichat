import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { formatSeparator, type Message } from '@/lib/chat';
import { haptics } from '@/lib/haptics';
import { savePhotoToLibrary, saveLabel } from '@/lib/save-photo';

import { useMediaUri } from './media-content';

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DISMISS_AT = 120;
const SPRING = { damping: 20, stiffness: 220 };

/**
 * Full-screen photo viewer: swipe sideways through the chat's photos, pinch or
 * double-tap to zoom, drag down to close, and save to Photos.
 */
export function PhotoViewer({ chatId, photos, startIndex, senderName, onClose }: {
  chatId: string;
  /** image messages, oldest first */
  photos: Message[];
  startIndex: number;
  senderName: (senderId: string) => string;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  // 0 = fully shown, 1 = dragged far enough to close (fades the backdrop).
  const dismiss = useSharedValue(0);
  const current = photos[index];

  const backdrop = useAnimatedStyle(() => ({ opacity: 1 - dismiss.get() * 0.7 }));
  const chrome = useAnimatedStyle(() => ({ opacity: 1 - dismiss.get() * 2 }));

  async function save() {
    if (!current?.mediaId || saving === 'busy') return;
    setSaving('busy');
    try {
      await savePhotoToLibrary(chatId, current.mediaId);
      haptics.success();
      setSaving('done');
    } catch {
      haptics.error();
      setSaving('failed');
    }
    setTimeout(() => setSaving('idle'), 1800);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Modals render outside the app's root, so gestures need their own root view. */}
      <GestureHandlerRootView style={styles.flex}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
        <FlatList
          data={photos}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={startIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(m) => m.id}
          // onScroll, not onMomentumScrollEnd: the latter doesn't fire on web, which left
          // the counter (and Save) pointing at the first photo.
          scrollEventThrottle={32}
          onScroll={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / width);
            if (next !== index && next >= 0 && next < photos.length) {
              setIndex(next);
              setSaving('idle');
            }
          }}
          renderItem={({ item }) => (
            <ZoomablePhoto
              chatId={chatId}
              message={item}
              width={width}
              height={height}
              dismiss={dismiss}
              onZoomChange={setZoomed}
              onClose={onClose}
            />
          )}
        />

        <Animated.View
          entering={FadeIn}
          style={[styles.topBar, { paddingTop: insets.top + 8 }, chrome]}
          pointerEvents="box-none">
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close" style={styles.round}>
            <Icon name="xmark" size={18} color="#fff" fallback="✕" />
          </Pressable>
          <View style={styles.titleBox}>
            <Text style={styles.title} numberOfLines={1}>
              {current ? senderName(current.senderId) : ''}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {current ? formatSeparator(current.createdAt) : ''}
              {photos.length > 1 ? `  ·  ${index + 1} of ${photos.length}` : ''}
            </Text>
          </View>
          <View style={styles.round} />
        </Animated.View>

        <Animated.View
          style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }, chrome]}
          pointerEvents="box-none">
          <Pressable
            onPress={save}
            disabled={saving === 'busy'}
            accessibilityRole="button"
            style={({ pressed }) => [styles.saveButton, { opacity: pressed ? 0.7 : 1 }]}>
            {saving === 'busy' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Icon
                name={saving === 'done' ? 'checkmark' : 'square.and.arrow.down'}
                size={17}
                color="#fff"
                fallback={saving === 'done' ? '✓' : '⤓'}
              />
            )}
            <Text style={styles.saveText}>
              {saving === 'done' ? 'Saved' : saving === 'failed' ? 'Could not save' : saveLabel}
            </Text>
          </Pressable>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ZoomablePhoto({ chatId, message, width, height, dismiss, onZoomChange, onClose }: {
  chatId: string;
  message: Message;
  width: number;
  height: number;
  dismiss: SharedValue<number>;
  onZoomChange: (zoomed: boolean) => void;
  onClose: () => void;
}) {
  const { uri, failed } = useMediaUri(chatId, message.mediaId ?? '', message.mime ?? 'image/jpeg');
  const [zoomed, setZoomed] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Fit the photo inside the screen, keeping its aspect ratio.
  const ratio = message.width && message.height ? message.width / message.height : 3 / 4;
  const fitW = Math.min(width, height * ratio);
  const fitH = fitW / ratio;

  function markZoom(next: boolean) {
    setZoomed(next);
    onZoomChange(next);
  }

  function reset() {
    scale.set(withSpring(1, SPRING));
    savedScale.set(1);
    tx.set(withSpring(0, SPRING));
    ty.set(withSpring(0, SPRING));
    savedTx.set(0);
    savedTy.set(0);
    markZoom(false);
  }

  /** Keeps a zoomed photo from being dragged off screen. */
  function clamp(x: number, y: number, s: number) {
    const maxX = Math.max(0, (fitW * s - width) / 2);
    const maxY = Math.max(0, (fitH * s - height) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }

  const pinch = usePinchGesture({
    runOnJS: true,
    onUpdate: (e) => {
      scale.set(Math.min(MAX_ZOOM, Math.max(0.8, savedScale.get() * e.scale)));
    },
    onDeactivate: () => {
      if (scale.get() <= 1.05) return reset();
      savedScale.set(scale.get());
      const c = clamp(tx.get(), ty.get(), scale.get());
      tx.set(withSpring(c.x, SPRING));
      ty.set(withSpring(c.y, SPRING));
      savedTx.set(c.x);
      savedTy.set(c.y);
      markZoom(true);
    },
  });

  // Zoomed: move around. Not zoomed: vertical drag closes (sideways drags page the list).
  const pan = usePanGesture({
    runOnJS: true,
    // (No object spread here: the worklets Babel plugin rejects it in gesture configs.)
    activeOffsetY: zoomed ? undefined : [-12, 12],
    failOffsetX: zoomed ? undefined : [-12, 12],
    onUpdate: (e) => {
      if (zoomed) {
        tx.set(savedTx.get() + e.translationX);
        ty.set(savedTy.get() + e.translationY);
      } else {
        ty.set(e.translationY);
        dismiss.set(Math.min(1, Math.abs(e.translationY) / (DISMISS_AT * 2)));
      }
    },
    onDeactivate: (e) => {
      if (zoomed) {
        const c = clamp(tx.get(), ty.get(), scale.get());
        tx.set(withSpring(c.x, SPRING));
        ty.set(withSpring(c.y, SPRING));
        savedTx.set(c.x);
        savedTy.set(c.y);
        return;
      }
      if (Math.abs(e.translationY) > DISMISS_AT) {
        haptics.light();
        onClose();
        return;
      }
      ty.set(withSpring(0, SPRING));
      dismiss.set(withTiming(0, { duration: 180 }));
    },
  });

  const doubleTap = useTapGesture({
    runOnJS: true,
    numberOfTaps: 2,
    onActivate: () => {
      if (zoomed) return reset();
      scale.set(withSpring(DOUBLE_TAP_ZOOM, SPRING));
      savedScale.set(DOUBLE_TAP_ZOOM);
      markZoom(true);
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.get() },
      { translateY: ty.get() },
      { scale: scale.get() * interpolate(dismiss.get(), [0, 1], [1, 0.85]) },
    ],
  }));

  return (
    <View style={[styles.page, { width, height }]}>
      {uri ? (
        <GestureDetector gesture={gesture}>
          <Animated.View style={[{ width: fitW, height: fitH }, style]}>
            <Image source={{ uri }} style={styles.flex} contentFit="contain" transition={150} />
          </Animated.View>
        </GestureDetector>
      ) : failed ? (
        <Text style={styles.failed}>Photo unavailable</Text>
      ) : (
        <ActivityIndicator color="#fff" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { backgroundColor: '#000' },
  page: { alignItems: 'center', justifyContent: 'center' },
  failed: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  titleBox: { flex: 1, alignItems: 'center' },
  title: { color: '#fff', fontSize: 16, fontWeight: '600' },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
