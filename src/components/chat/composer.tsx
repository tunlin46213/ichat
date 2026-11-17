import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Accent, Spacing } from '@/constants/theme';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useTheme } from '@/hooks/use-theme';
import type { ReplyRef } from '@/lib/chat';
import { haptics } from '@/lib/haptics';
import { MAX_VOICE_MS } from '@/lib/media';

const TYPING_SIGNAL_MS = 3000;
const MIN_VOICE_MS = 800;

function formatClock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
  onVoice: (uri: string, durationMs: number) => void;
  /** e.g. "Sending photo…" while an upload is in progress */
  busyLabel: string | null;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const lastSignal = useRef(0);
  const [draft, setDraft] = useState(initialText);
  const [sending, setSending] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Low-quality preset keeps a 60 s voice note small enough to store in Firestore.
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recState = useAudioRecorderState(recorder, 200);
  const recording = recState.isRecording;
  const autoStopped = useRef(false);

  // Send automatically at the length limit.
  useEffect(() => {
    if (!recording) {
      autoStopped.current = false;
      return;
    }
    if (recState.durationMillis >= MAX_VOICE_MS && !autoStopped.current) {
      autoStopped.current = true;
      finishRecording(true);
    }
  });

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

  async function startRecording() {
    setVoiceError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setVoiceError('Allow microphone access in Settings to send voice messages.');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      haptics.medium();
    } catch {
      setVoiceError('Could not start recording.');
    }
  }

  async function finishRecording(sendIt: boolean) {
    const duration = recState.durationMillis;
    try {
      await recorder.stop();
    } finally {
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
    if (!sendIt) return haptics.warning();
    if (duration < MIN_VOICE_MS || !recorder.uri) {
      setVoiceError('Hold on a little longer to record a voice message.');
      return;
    }
    onVoice(recorder.uri, duration);
  }

  const hasText = draft.trim().length > 0;
  const canSend = enabled && hasText && !sending;
  const showMic = enabled && !hasText && !editing;
  const note = busyLabel ?? voiceError;

  return (
    <View
      style={[
        styles.wrap,
        {
          // Home-indicator space only matters while the keyboard is hidden.
          paddingBottom: keyboardVisible ? Spacing.two : Math.max(insets.bottom, Spacing.two),
          borderTopColor: theme.separator,
          backgroundColor: theme.background,
        },
      ]}>
      {editing || replyTo ? (
        <Animated.View
          entering={FadeInDown.duration(180)}
          exiting={FadeOutDown.duration(120)}
          style={styles.context}>
          <View style={[styles.contextBar, { backgroundColor: Accent }]} />
          <View style={styles.contextBody}>
            <Text style={styles.contextTitle} numberOfLines={1}>
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
        <Text style={[styles.note, { color: voiceError && !busyLabel ? '#FF3B30' : theme.textSecondary }]}>
          {note}
        </Text>
      ) : null}

      <View style={styles.row}>
        {!recording && !editing ? (
          <RoundButton
            icon="plus"
            label="Attach photo"
            onPress={onAttach}
            disabled={!enabled || !!busyLabel}
            tint={theme.textSecondary}
            background={theme.backgroundElement}
          />
        ) : null}

        <View style={[styles.inputWrap, { borderColor: recording ? '#FF3B30' : theme.separator }]}>
          {recording ? (
            <Animated.View entering={FadeIn} style={styles.recording}>
              <View style={styles.recDot} />
              <Text style={[styles.recTime, { color: theme.text }]}>
                {formatClock(recState.durationMillis)}
                <Text style={{ color: theme.textSecondary }}> / {formatClock(MAX_VOICE_MS)}</Text>
              </Text>
              <Pressable onPress={() => finishRecording(false)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.recCancel}>Cancel</Text>
              </Pressable>
            </Animated.View>
          ) : (
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={onChange}
              onBlur={stopTyping}
              placeholder={editing ? 'Edit message' : 'Message'}
              placeholderTextColor={theme.textSecondary}
              multiline
              // Web renders multiline as a 2-row textarea by default; keep it one line.
              numberOfLines={Platform.OS === 'web' ? 1 : undefined}
              maxLength={4000}
              editable={enabled}
              accessibilityLabel="Message"
              style={[styles.input, { color: theme.text }]}
            />
          )}
          {recording ? (
            <SendButton active onPress={() => finishRecording(true)} icon="arrow.up" label="Send voice message" />
          ) : showMic ? (
            <SendButton active onPress={startRecording} icon="mic.fill" label="Record voice message" muted />
          ) : (
            <SendButton
              active={canSend}
              onPress={send}
              icon={editing ? 'checkmark' : 'arrow.up'}
              label={editing ? 'Save edit' : 'Send'}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function RoundButton({ icon, label, onPress, disabled, tint, background }: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tint: string;
  background: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: background, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
      ]}>
      <Icon name={icon} size={18} color={tint} fallback="+" />
    </Pressable>
  );
}

/** Round button in the input: ↑ send, ✓ save edit, or 🎤 record. Springs when it activates. */
function SendButton({ active, onPress, icon, label, muted }: {
  active: boolean;
  onPress: () => void;
  icon: IconName;
  label: string;
  /** mic: no blue fill, just the glyph */
  muted?: boolean;
}) {
  const theme = useTheme();
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(active ? 1 : 0.85, { damping: 14, stiffness: 300 }) }],
  }));
  const bg = muted ? 'transparent' : active ? Accent : theme.backgroundSelected;
  return (
    <Pressable
      onPress={onPress}
      disabled={!active}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}>
      <Animated.View style={[styles.send, { backgroundColor: bg }, animated]}>
        <Icon name={icon} size={muted ? 19 : 15} color={muted ? theme.textSecondary : '#fff'} fallback="↑" />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 10, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  contextBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  contextBody: { flex: 1 },
  contextTitle: { color: Accent, fontSize: 13, fontWeight: '600' },
  contextText: { fontSize: 14 },
  note: { fontSize: 12, textAlign: 'center', paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  round: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 19,
    paddingLeft: 14,
    paddingRight: 3,
    minHeight: 38,
  },
  input: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    maxHeight: 130,
    paddingTop: Platform.OS === 'ios' ? 8 : 7,
    paddingBottom: 7,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', resize: 'none' } as object) : {}),
  },
  recording: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 36 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30' },
  recTime: { flex: 1, fontSize: 17, fontVariant: ['tabular-nums'] },
  recCancel: { color: '#FF3B30', fontSize: 15, fontWeight: '600', marginRight: 8 },
  send: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
    marginLeft: 6,
  },
});
