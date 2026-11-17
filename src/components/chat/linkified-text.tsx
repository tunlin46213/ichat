import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';

// http(s) links and bare "www." links. Trailing punctuation is left out of the link.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;"')\]!?])/gi;

function openUrl(raw: string) {
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  Linking.openURL(url).catch(() => {});
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
