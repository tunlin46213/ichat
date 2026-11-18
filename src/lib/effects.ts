/*
 * Full-screen message effects, picked from the text (like iMessage's "sent with
 * Confetti"), in English and Burmese. Decided on each phone; nothing extra is stored.
 */
export type EffectKind = 'balloons' | 'confetti' | 'hearts' | 'fireworks';

// First match wins.
const RULES: { kind: EffectKind; test: RegExp }[] = [
  { kind: 'balloons', test: /happy\s*birth\s*day|\bhbd\b|🎂|🎈|မွေးနေ့/i },
  { kind: 'confetti', test: /congrat|well done|🎉|🥳|ဂုဏ်ယူ|အောင်မြင်/i },
  { kind: 'fireworks', test: /happy\s*new\s*year|🎆|🎇|နှစ်သစ်/i },
  { kind: 'hearts', test: /love\s*(you|u)\b|\bily\b|miss\s*(you|u)\b|❤️|💕|💖|😍|🥰|ချစ်တယ်|လွမ်းတယ်/i },
];

export function effectFor(text: string | undefined | null): EffectKind | null {
  if (!text) return null;
  return RULES.find((r) => r.test.test(text))?.kind ?? null;
}
