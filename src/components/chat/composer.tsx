import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOutDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Spacing } from '@/constants/theme';
import { useAppearance } from '@/context/appearance';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useTheme } from '@/hooks/use-theme';
import type { ReplyRef } from '@/lib/chat';
import { getDraft, setDraft as saveDraft } from '@/lib/drafts';
import { haptics } from '@/lib/haptics';
import { MAX_VOICE_MS } from '@/lib/media';

const TYPING_SIGNAL_MS = 4000;
const MIN_VOICE_MS = 800;
/** Drag the held mic this far left to throw the recording away. */
const CANCEL_AT = -90;

const WAVEFORM_BARS = 40;
const RECORDING_OPTIONS = { ...RecordingPresets.LOW_QUALITY, isMeteringEnabled: true };

const EMOJIS = [
  '😀', '😂', '🥹', '😍', '🥰', '😘', '😎', '🤩',
  '🤔', '😅', '😭', '😡', '🥺', '😴', '🤗', '🙄',
  '👍', '👎', '👏', '🙏', '💪', '👌', '✌️', '🤝',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🔥', '✨',
  '🎉', '🎂', '🌹', '☕️', '🍜', '⚽️', '🏠', '🙌',
];

/** Squeezes metering samples (dBFS, about -60…0) into WAVEFORM_BARS levels of 0–1. */
function toWaveform(samples: number[]) {
  if (!samples.length) return [];
  return Array.from({ length: WAVEFORM_BARS }, (_, i) => {
    const from = Math.floor((i / WAVEFORM_BARS) * samples.length);
    const to = Math.max(from + 1, Math.floor(((i + 1) / WAVEFORM_BARS) * samples.length));
    const slice = samples.slice(from, to);
    const db = Math.max(...slice);
    return Math.round(Math.max(0, Math.min(1, (db + 55) / 50)) * 100) / 100;
  });
}

function formatClock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const glassAvailable = isLiquidGlassAvailable();

/** Liquid Glass on iOS 26+, a soft translucent fill elsewhere. */
function Glass({ style, children }: { style: StyleProp<ViewStyle>; children?: ReactNode }) {
  const theme = useTheme();
  if (glassAvailable) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive style={style}>
        {children}
      </GlassView>
    );
  }
  return (
    <View
      style={[
        style,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.separator,
          borderWidth: StyleSheet.hairlineWidth,
        },
      ]}>
      {children}
    </View>
  );
}

/**
 * Message input. Remount it (via `key`) to start editing a message: `initialText`
 * is only read on mount.
 */
export function Composer({
  enabled,
  initialText = '',
  editing,
  onCancelEdit,
  replyTo,
  replyAuthor,
  onCancelReply,
  onSend,
  onTyping,
  onAttach,
  onVoice,
  busyLabel,
  draftKey,
  onActivity,
  onSchedule,
}: {
  enabled: boolean;
  initialText?: string;
  /** true while editing an existing message */
  editing: boolean;
  onCancelEdit: () => void;
  replyTo: ReplyRef | null;
  replyAuthor: string;
  onCancelReply: () => void;
  /** Return false to put the text back (send failed). */
  onSend: (text: string) => Promise<boolean>;
  /** Called with true at most every few seconds while typing, and false when stopped. */
  onTyping: (typing: boolean) => void;
  onAttach: () => void;
  onVoice: (uri: string, durationMs: number, waveform: number[]) => void;
  /** e.g. "Sending photo…" while an upload is in progress */
  busyLabel: string | null;
  /** chat id: unsent text is kept as a draft for it (not while editing) */
  draftKey?: string;
  /** "recording" while a voice note is being recorded, null when it ends */
  onActivity?: (kind: 'recording' | null) => void;
  /** long press on Send: schedule `text`; call `clear` once it's scheduled */
  onSchedule?: (text: string, clear: () => void) => void;
}) {
  const theme = useTheme();
  const { bubbleColor, textScale } = useAppearance();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const lastSignal = useRef(0);
  const [draft, setDraftState] = useState(() =>
    editing || !draftKey ? initialText : initialText || getDraft(draftKey)
  );
  function setDraft(text: string) {
    setDraftState(text);
    if (draftKey && !editing) saveDraft(draftKey, text);
  }
  const [sending, setSending] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Low-quality preset keeps a 60 s voice note small enough to store in Firestore.
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recState = useAudioRecorderState(recorder, 100);
  const recording = recState.isRecording;
  const autoStopped = useRef(false);
  // Loudness samples for the voice note's waveform.
  const levels = useRef<number[]>([]);
  const lastSampleAt = useRef(-1);
  // Hold-to-record state: finger down, recorder actually started, dragged to cancel.
  const holding = useRef(false);
  const started = useRef(false);
  const cancelled = useRef(false);
  // Set when the 60 s limit sent the note while the finger was still down.
  const limitSent = useRef(false);
  const [willCancel, setWillCancel] = useState(false);
  const slideX = useSharedValue(0);

  // Focus the field when replying or editing.
  useEffect(() => {
    if (replyTo || editing) inputRef.current?.focus();
  }, [replyTo, editing]);

  function stopTyping() {
    if (lastSignal.current) {
      lastSignal.current = 0;
      onTyping(false);
    }
  }

  function onChange(text: string) {
    setDraft(text);
    if (editing) return;
    if (!text.trim()) return stopTyping();
    const now = Date.now();
    if (now - lastSignal.current > TYPING_SIGNAL_MS) {
      lastSignal.current = now;
      onTyping(true);
    }
  }

  /** Long press on Send: pick a time; the text is cleared once it's scheduled. */
  function scheduleDraft() {
    const text = draft.trim();
    if (!text || !enabled || !onSchedule) return;
    haptics.medium();
    onSchedule(text, () => setDraft(''));
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending || !enabled) return;
    setSending(true);
    setDraft('');
    lastSignal.current = 0; // sendMessage clears the typing flag server-side
    const ok = await onSend(text);
    if (!ok) setDraft(text);
    setSending(false);
  }

  function toggleEmoji() {
    haptics.light();
    if (emojiOpen) {
      setEmojiOpen(false);
      inputRef.current?.focus();
    } else {
      Keyboard.dismiss();
      setEmojiOpen(true);
    }
  }

  // ── Hold to record ──
  async function beginHold() {
    if (!enabled || recording) return;
    holding.current = true;
    started.current = false;
    cancelled.current = false;
    limitSent.current = false;
    setWillCancel(false);
    setEmojiOpen(false);
    setVoiceError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      holding.current = false;
      setVoiceError('Allow microphone access in Settings to send voice messages.');
      return;
    }
    // Let go while the permission prompt or setup was showing: don't start.
    if (!holding.current) return;
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!holding.current) {
        setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
        return;
      }
      levels.current = [];
      lastSampleAt.current = -1;
      recorder.record();
      started.current = true;
      onActivity?.('recording');
      haptics.medium();
    } catch {
      holding.current = false;
      setVoiceError('Could not start recording.');
    }
  }

  function endHold() {
    const wasHolding = holding.current;
    holding.current = false;
    slideX.set(withSpring(0, { damping: 18 }));
    setWillCancel(false);
    if (!started.current) {
      // A quick tap: explain the gesture (unless the limit already sent it).
      if (wasHolding && !limitSent.current) setVoiceError('Hold the mic to record, release to send.');
      return;
    }
    started.current = false;
    finishRecording(!cancelled.current);
  }

  async function finishRecording(sendIt: boolean) {
    const duration = recState.durationMillis;
    onActivity?.(null);
    try {
      await recorder.stop();
    } finally {
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
    if (!sendIt) return haptics.warning();
    if (duration < MIN_VOICE_MS || !recorder.uri) {
      setVoiceError('Hold a little longer to record a voice message.');
      return;
    }
    onVoice(recorder.uri, duration, toWaveform(levels.current));
  }

  // Collect loudness while recording, and send automatically at the length limit.
  useEffect(() => {
    if (!recording) {
      autoStopped.current = false;
      return;
    }
    // One sample per recorder status update (other re-renders must not add duplicates).
    if (typeof recState.metering === 'number' && recState.durationMillis !== lastSampleAt.current) {
      lastSampleAt.current = recState.durationMillis;
      levels.current.push(recState.metering);
    }
    if (recState.durationMillis >= MAX_VOICE_MS && !autoStopped.current) {
      autoStopped.current = true;
      // The finger may still be down; its release must not stop/send a second time.
      started.current = false;
      limitSent.current = true;
      finishRecording(true);
    }
  });

  const hold = usePanGesture({
    runOnJS: true,
    enabled,
    onBegin: () => {
      beginHold();
    },
    onUpdate: (e) => {
      const x = Math.min(0, e.translationX);
      slideX.set(x);
      const cancel = x < CANCEL_AT;
      if (cancel !== cancelled.current) {
        cancelled.current = cancel;
        setWillCancel(cancel);
        haptics.light();
      }
    },
    onFinalize: () => endHold(),
  });

  const hasText = draft.trim().length > 0;
  const canSend = enabled && hasText && !sending;
  const showMic = enabled && !hasText && !editing;
  const note = busyLabel ?? voiceError;

  return (
    <View
      style={[
        styles.wrap,
        {
          // Home-indicator space only matters while the keyboard (or emoji panel) is hidden.
          paddingBottom:
            keyboardVisible || emojiOpen ? Spacing.two : Math.max(insets.bottom, Spacing.two),
        },
      ]}>
      {editing || replyTo ? (
        <Animated.View
          entering={FadeInDown.duration(180)}
          exiting={FadeOutDown.duration(120)}
          style={[styles.context, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.contextBar, { backgroundColor: bubbleColor }]} />
          <View style={styles.contextBody}>
            <Text style={[styles.contextTitle, { color: bubbleColor }]} numberOfLines={1}>
              {editing ? 'Editing message' : `Replying to ${replyAuthor}`}
            </Text>
            <Text style={[styles.contextText, { color: theme.textSecondary }]} numberOfLines={1}>
              {editing ? initialText : replyTo?.text}
            </Text>
          </View>
          <Pressable
            onPress={editing ? onCancelEdit : onCancelReply}
            hitSlop={10}
            accessibilityLabel={editing ? 'Cancel editing' : 'Cancel reply'}>
            <Icon name="xmark.circle.fill" size={20} color={theme.textSecondary} fallback="×" />
          </Pressable>
        </Animated.View>
      ) : null}

      {note ? (
        <Animated.Text
          entering={FadeIn}
          style={[styles.note, { color: voiceError && !busyLabel ? '#FF3B30' : theme.textSecondary }]}>
          {note}
        </Animated.Text>
      ) : null}

      <View style={styles.row}>
        {!recording && !editing ? (
          <Pressable
            onPress={onAttach}
            disabled={!enabled || !!busyLabel}
            accessibilityRole="button"
            accessibilityLabel="Attach photo or location"
            hitSlop={6}
            style={({ pressed }) => ({ opacity: !enabled || busyLabel ? 0.4 : pressed ? 0.6 : 1 })}>
            <Glass style={styles.round}>
              <Icon name="plus" size={19} color={theme.text} fallback="+" />
            </Glass>
          </Pressable>
        ) : null}

        <Glass style={[styles.inputWrap, recording && styles.inputRecording]}>
          {recording ? (
            <RecordingStrip
              durationMs={recState.durationMillis}
              willCancel={willCancel}
              slideX={slideX}
            />
          ) : (
            <>
              {!editing ? (
                <Pressable
                  onPress={toggleEmoji}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={emojiOpen ? 'Show keyboard' : 'Show emoji'}
                  style={styles.emojiButton}>
                  <Icon
                    name={emojiOpen ? 'keyboard' : 'face.smiling'}
                    size={22}
                    color={emojiOpen ? bubbleColor : theme.textSecondary}
                    fallback={emojiOpen ? '⌨' : '☺'}
                  />
                </Pressable>
              ) : null}
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={onChange}
                onBlur={stopTyping}
                onFocus={() => setEmojiOpen(false)}
                placeholder={editing ? 'Edit message' : 'Message'}
                placeholderTextColor={theme.textSecondary}
                multiline
                // Web renders multiline as a 2-row textarea by default; keep it one line.
                numberOfLines={Platform.OS === 'web' ? 1 : undefined}
                maxLength={4000}
                editable={enabled}
                accessibilityLabel="Message"
                style={[styles.input, { color: theme.text, fontSize: 17 * textScale }, editing && styles.inputEditing]}
              />
            </>
          )}
          {/* Mic and Send swap with a little spin as text appears / disappears. */}
          {showMic ? (
            <Animated.View key="mic" entering={MORPH_IN} exiting={MORPH_OUT}>
              <GestureDetector gesture={hold}>
                <View
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Hold to record a voice message"
                  hitSlop={8}>
                  <MicButton recording={recording} willCancel={willCancel} color={bubbleColor} />
                </View>
              </GestureDetector>
            </Animated.View>
          ) : (
            <Animated.View key="send" entering={MORPH_IN} exiting={MORPH_OUT}>
              <SendButton
                active={canSend}
                onPress={send}
                onLongPress={!editing && onSchedule ? scheduleDraft : undefined}
                icon={editing ? 'checkmark' : 'arrow.up'}
                label={editing ? 'Save edit' : 'Send'}
                color={bubbleColor}
              />
            </Animated.View>
          )}
        </Glass>
      </View>

      {emojiOpen ? (
        <Animated.View entering={FadeInDown.duration(160)} style={styles.emojiPanel}>
          <ScrollView contentContainerStyle={styles.emojiGrid} keyboardShouldPersistTaps="always">
            {EMOJIS.map((e) => (
              <Pressable
                key={e}
                onPress={() => {
                  haptics.light();
                  onChange(draft + e);
                }}
                accessibilityLabel={e}
                style={({ pressed }) => [
                  styles.emojiCell,
                  pressed && { backgroundColor: theme.backgroundSelected },
                ]}>
                <Text style={styles.emoji}>{e}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Inside the input while recording: pulsing dot, timer, "‹ Slide to cancel". */
function RecordingStrip({ durationMs, willCancel, slideX }: {
  durationMs: number;
  willCancel: boolean;
  slideX: ReturnType<typeof useSharedValue<number>>;
}) {
  const theme = useTheme();
  const blink = useSharedValue(1);
  useEffect(() => {
    blink.set(withRepeat(withTiming(0.25, { duration: 600 }), -1, true));
  }, [blink]);
  const dot = useAnimatedStyle(() => ({ opacity: blink.get() }));
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.get() * 0.6 }],
    opacity: interpolate(slideX.get(), [CANCEL_AT, 0], [0.35, 1], 'clamp'),
  }));
  return (
    <Animated.View entering={FadeIn} style={styles.recording}>
      <Animated.View style={[styles.recDot, dot]} />
      <Text style={[styles.recTime, { color: theme.text }]}>{formatClock(durationMs)}</Text>
      <Animated.View style={[styles.slideHint, slide]}>
        <Text style={[styles.slideText, { color: willCancel ? '#FF3B30' : theme.textSecondary }]}>
          {willCancel ? 'Release to cancel' : '‹  Slide to cancel'}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

/** Mic in the input; grows into a big colored circle while held. */
/** Pops in with a quarter turn (custom animations aren't supported on web: plain zoom there). */
function MorphIn() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.4 }, { rotate: '-90deg' }] },
    animations: {
      opacity: withTiming(1, { duration: 120 }),
      transform: [
        { scale: withSpring(1, { damping: 12, stiffness: 260 }) },
        { rotate: withSpring('0deg', { damping: 14, stiffness: 220 }) },
      ],
    },
  };
}
const MORPH_IN = Platform.OS === 'web' ? ZoomIn.duration(160) : MorphIn;
const MORPH_OUT = ZoomOut.duration(110);

function MicButton({ recording, willCancel, color }: {
  recording: boolean;
  willCancel: boolean;
  color: string;
}) {
  const theme = useTheme();
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(recording ? 1.35 : 1, { damping: 13, stiffness: 260 }) }],
  }));
  return (
    <Animated.View
      style={[
        styles.send,
        recording
          ? { backgroundColor: willCancel ? '#FF3B30' : color, boxShadow: `0 4px 14px ${color}66` }
          : null,
        animated,
      ]}>
      <Icon
        name={willCancel ? 'xmark' : 'mic.fill'}
        size={recording ? 16 : 19}
        color={recording ? '#fff' : theme.textSecondary}
        fallback="🎤"
      />
    </Animated.View>
  );
}

/** Round gradient send / save button. Springs in when it becomes active. */
function SendButton({ active, onPress, onLongPress, icon, label, color }: {
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  icon: IconName;
  label: string;
  color: string;
}) {
  const theme = useTheme();
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(active ? 1 : 0.85, { damping: 14, stiffness: 300 }) }],
  }));
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={!active}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={onLongPress ? 'Long press to schedule' : undefined}
      hitSlop={6}>
      <Animated.View
        style={[
          styles.send,
          active
            ? {
                backgroundColor: color,
                backgroundImage: `linear-gradient(135deg, ${color} 0%, #FF6CAB 140%)`,
                boxShadow: `0 3px 10px ${color}55`,
              }
            : { backgroundColor: theme.backgroundSelected },
          animated,
        ]}>
        <Icon name={icon} size={15} color="#fff" fallback="↑" />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 10, paddingTop: 6 },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    borderRadius: 14,
  },
  contextBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  contextBody: { flex: 1 },
  contextTitle: { fontSize: 13, fontWeight: '600' },
  contextText: { fontSize: 14 },
  note: { fontSize: 12, textAlign: 'center', paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 21,
    paddingLeft: 6,
    paddingRight: 4,
    minHeight: 42,
    overflow: 'hidden',
  },
  inputRecording: { paddingLeft: 14 },
  emojiButton: { paddingHorizontal: 6, paddingBottom: 10 },
  input: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    maxHeight: 130,
    paddingTop: Platform.OS === 'ios' ? 10 : 9,
    paddingBottom: 9,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', resize: 'none' } as object) : {}),
  },
  inputEditing: { paddingLeft: 8 },
  recording: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 42 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30' },
  recTime: { fontSize: 17, fontVariant: ['tabular-nums'], minWidth: 44 },
  slideHint: { flex: 1, alignItems: 'center' },
  slideText: { fontSize: 15, fontWeight: '500' },
  send: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    marginLeft: 4,
  },
  emojiPanel: { height: 230, marginTop: 8 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  emojiCell: {
    width: '12.5%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  emoji: { fontSize: 28 },
});
