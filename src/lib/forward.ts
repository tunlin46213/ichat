import { ensureChat, sendLocation, sendMessage, type Message } from '@/lib/chat';
import { readMediaBase64, sendMediaMessage } from '@/lib/media';

/** Message types that can be forwarded (call log entries can't). */
export function canForward(message: Message) {
  return !message.deleted && (message.type ?? 'text') !== 'call';
}

/**
 * Sends a copy of `message` (from `fromChatId`) to the chat with `to`, marked
 * "Forwarded". Photos and voice notes are copied, so they stay even if the original
 * chat is deleted. Returns the target chat id.
 */
export async function forwardMessage(
  fromChatId: string,
  message: Message,
  me: { uid: string; name: string },
  to: { uid: string; name: string }
) {
  const chatId = await ensureChat(me, to);
  const opts = { forwarded: true };
  switch (message.type ?? 'text') {
    case 'image':
      await sendMediaMessage(
        chatId,
        me.uid,
        to.uid,
        {
          type: 'image',
          base64: await readMediaBase64(fromChatId, message.mediaId!),
          width: message.width ?? 0,
          height: message.height ?? 0,
        },
        opts
      );
      break;
    case 'audio':
      await sendMediaMessage(
        chatId,
        me.uid,
        to.uid,
        {
          type: 'audio',
          base64: await readMediaBase64(fromChatId, message.mediaId!),
          mime: message.mime,
          durationMs: message.durationMs ?? 0,
          waveform: message.waveform,
        },
        opts
      );
      break;
    case 'location':
      await sendLocation(chatId, me.uid, to.uid, { lat: message.lat!, lng: message.lng! }, opts);
      break;
    default:
      // A shared moment keeps its preview card.
      await sendMessage(chatId, me.uid, to.uid, message.text, null, {
        ...opts,
        ...(message.moment ? { moment: message.moment } : {}),
      });
  }
  return chatId;
}
