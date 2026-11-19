import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type PromptOptions = {
  title: string;
  message: string;
  defaultValue?: string;
  secure?: boolean;
  confirmLabel: string;
  onSubmit: (value: string) => void;
};

type Listener = (opts: PromptOptions) => void;
const listeners = new Set<Listener>();

/**
 * Text-entry dialog for Android, which has no Alert.prompt (iOS uses the native one).
 * Needs <PromptHost /> mounted once above the app.
 */
export function showPrompt(opts: PromptOptions) {
  listeners.forEach((listener) => listener(opts));
}

export function PromptHost() {
  const [current, setCurrent] = useState<{ opts: PromptOptions; id: number } | null>(null);
  useEffect(() => {
    let id = 0;
    const listener: Listener = (opts) => setCurrent({ opts, id: ++id });
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  if (!current) return null;
  return <PromptDialog key={current.id} opts={current.opts} onClose={() => setCurrent(null)} />;
}

function PromptDialog({ opts, onClose }: { opts: PromptOptions; onClose: () => void }) {
  const theme = useTheme();
  const [value, setValue] = useState(opts.defaultValue ?? '');
  const submit = () => {
    onClose();
    opts.onSubmit(value);
  };
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior="padding"
        style={[StyleSheet.absoluteFill, styles.backdrop]}>
        <Animated.View entering={FadeIn.duration(150)} style={[styles.dialog, { backgroundColor: theme.card }]}>
          <Text style={[styles.title, { color: theme.text }]}>{opts.title}</Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>{opts.message}</Text>
          <TextInput
            autoFocus
            value={value}
            onChangeText={setValue}
            secureTextEntry={opts.secure}
            selectTextOnFocus={!opts.secure}
            returnKeyType="done"
            onSubmitEditing={submit}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <View style={styles.buttons}>
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.button} hitSlop={6}>
              <Text style={[styles.buttonText, { color: theme.accent }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} accessibilityRole="button" style={styles.button} hitSlop={6}>
              <Text style={[styles.buttonText, styles.bold, { color: theme.accent }]}>{opts.confirmLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, borderRadius: Radius.lg, padding: 20, gap: 10 },
  title: { fontSize: 19, fontWeight: '700' },
  message: { fontSize: 15, lineHeight: 20 },
  input: { fontSize: 17, height: 46, borderRadius: Radius.md, paddingHorizontal: 12, marginTop: 4 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  button: { paddingHorizontal: 12, paddingVertical: 8 },
  buttonText: { fontSize: 16 },
  bold: { fontWeight: '700' },
});
