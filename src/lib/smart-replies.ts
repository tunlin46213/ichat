import type { Message } from '@/lib/chat';

/*
 * On-device quick replies for the last message I received. Simple keyword rules in
 * English and Burmese: free, instant, and nothing leaves the phone.
 */

const MYANMAR = /[က-႟]/;

type Rule = { test: RegExp; en: string[]; my?: string[] };

// First match wins, so more specific rules come first.
const RULES: Rule[] = [
  {
    test: /good ?night|\bgn\b|sleep|အိပ်(တော့|ပြီ|မယ်)|ကောင်းသောည/i,
    en: ['Good night 🌙', 'Sweet dreams ✨', 'Sleep well 😴'],
    my: ['Good night 🌙', 'အိပ်မက်လှလှ မက်ပါစေ ✨', 'ကောင်းကောင်းအိပ်နော် 😴'],
  },
  {
    test: /good ?morning|\bgm\b|မနက်ခင်း/i,
    en: ['Good morning ☀️', 'Morning! Have a great day', '😊'],
    my: ['Good morning ☀️', 'မင်္ဂလာနံနက်ခင်းပါ', '😊'],
  },
  {
    test: /thank|thx|\bty\b|ကျေးဇူး/i,
    en: ["You're welcome 😊", 'Anytime!', '🙏'],
    my: ['ရပါတယ် 😊', 'ဘာမှမဟုတ်ပါဘူး', '🙏'],
  },
  {
    test: /sorry|my bad|apolog|ဆောရီး|တောင်းပန်/i,
    en: ['No worries 😊', "It's okay", 'All good 👍'],
    my: ['ရပါတယ် 😊', 'ကိစ္စမရှိပါဘူး', '👍'],
  },
  {
    test: /miss you|love you|\bily\b|လွမ်း|ချစ်/i,
    en: ['❤️', 'Miss you too 🥺', 'Love you too 💕'],
    my: ['❤️', 'လွမ်းတယ် 🥺', 'ချစ်တယ် 💕'],
  },
  {
    test: /congrat|well done|great job|ဂုဏ်ယူ/i,
    en: ['Thank you! 🙏', 'Thanks so much 😊', '🎉'],
    my: ['ကျေးဇူးပါ 🙏', 'ဝမ်းသာပါတယ် 😊', '🎉'],
  },
  {
    test: /^(hi|hello|hey|yo|hii+|mingala)\b|မင်္ဂလာ|ဟိုင်း|ဟယ်လို/i,
    en: ['Hi! 👋', 'Hey, how are you?', '😊'],
    my: ['မင်္ဂလာပါ 👋', 'နေကောင်းလား', '😊'],
  },
  {
    test: /how are you|how r u|how's it going|wyd|နေကောင်းလား|ဘာလုပ်နေ/i,
    en: ["I'm good, you? 😊", 'All good!', 'Busy but fine'],
    my: ['ကောင်းပါတယ်၊ ကိုယ်ရော? 😊', 'အဆင်ပြေပါတယ်', 'အလုပ်များနေတယ်'],
  },
  {
    test: /where are you|where r u|ဘယ်မှာလဲ|ဘယ်ရောက်/i,
    en: ['On my way 🚗', 'At home 🏠', 'Almost there!'],
    my: ['လာနေပြီ 🚗', 'အိမ်မှာ 🏠', 'ရောက်တော့မယ်'],
  },
  {
    test: /(free|available|busy|come|join|ready|meet|tonight|tomorrow).*\?|အားလား|လာမလား|တွေ့ရအောင်/i,
    en: ['Yes 👍', 'Not today', 'What time?'],
    my: ['အားတယ် 👍', 'ဒီနေ့ မအားဘူး', 'ဘယ်အချိန်လဲ?'],
  },
  {
    test: /(haha|hehe|lol|lmao|😂|🤣|ဟားဟား)/i,
    en: ['😂', 'Haha', '🤣'],
    my: ['😂', 'ဟားဟား', '🤣'],
  },
  {
    test: /^(ok|okay|k|kk|sure|alright|fine|အိုကေ|ဟုတ်ကဲ့|ရတယ်)[.!]*$/i,
    en: ['👍', 'Great!', 'See you 👋'],
    my: ['👍', 'ကောင်းပြီ', 'နောက်မှတွေ့မယ် 👋'],
  },
  {
    // Any other question.
    test: /\?\s*$|(လား|လဲ|သလဲ|မလား|နော်)\s*[?？]?\s*$/,
    en: ['Yes', 'No', 'Not sure 🤔'],
    my: ['ဟုတ်တယ်', 'မဟုတ်ဘူး', 'မသေချာဘူး 🤔'],
  },
];

/** Up to three short replies for `message`, or [] when none fit. */
export function suggestReplies(message: Message | undefined | null): string[] {
  if (!message || message.deleted) return [];
  switch (message.type ?? 'text') {
    case 'image':
      return ['Nice! 😍', 'Wow 🔥', '❤️'];
    case 'audio':
      return ['Got it 👍', 'Okay', 'Will listen later 🎧'];
    case 'location':
      return ['On my way 🚗', 'Thanks! 📍', 'How far is it?'];
    case 'call':
      return message.callStatus === 'missed'
        ? ['Sorry, I missed your call', 'Call you back soon 📞', "Can't talk now"]
        : ['Nice talking to you 😊', '👍'];
    default:
      break;
  }
  const text = message.text.trim();
  if (!text) return [];
  const burmese = MYANMAR.test(text);
  for (const rule of RULES) {
    if (rule.test.test(text)) return burmese && rule.my ? rule.my : rule.en;
  }
  return burmese ? ['👍', '😂', '❤️'] : ['👍', 'Haha 😂', '❤️'];
}
