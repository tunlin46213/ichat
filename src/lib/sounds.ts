import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

let send: AudioPlayer | null = null;

/**
 * Short "whoosh" when I send a message. Like iMessage, it follows the silent
 * switch (the default audio mode), so it stays quiet in silent mode.
 */
export function playSendSound() {
  try {
    send ??= createAudioPlayer(require('../../assets/sounds/send.wav'));
    send.volume = 0.6;
    send.seekTo(0);
    send.play();
  } catch {
    // No audio available (e.g. browser autoplay rules): sending still works.
  }
}
