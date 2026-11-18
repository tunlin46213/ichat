import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';

// http(s) links and bare "www." links. Trailing punctuation is left out of the link.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;"')\]!?])/gi;

function normalizeUrl(raw: string) {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function openUrl(raw: string) {
  Linking.openURL(normalizeUrl(raw)).catch(() => {});
}

/** The first link in `text` (with https:// added to bare "www." links), or null. */
export function firstUrl(text: string) {
  const match = text.match(new RegExp(URL_RE.source, 'i'));
  return match ? normalizeUrl(match[0]) : null;
}

/** Text with tappable, underlined links. */
export function LinkifiedText({ text, style, linkColor }: {
  text: string;
  style?: StyleProp<TextStyle>;
  linkColor: string;
}) {
  const parts = text.split(URL_RE);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        // split() with a capture group puts the matches at odd indexes
        i % 2 === 1 ? (
          <Text
            key={i}
            onPress={() => openUrl(part)}
            accessibilityRole="link"
            style={{ color: linkColor, textDecorationLine: 'underline' }}>
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}
