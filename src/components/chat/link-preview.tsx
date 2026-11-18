import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type Preview = { title: string; description: string | null; image: string | null; host: string };

// url → preview (null = nothing useful). Pages are fetched once per app run.
const cache = new Map<string, Promise<Preview | null>>();

function decode(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function meta(html: string, ...names: string[]) {
  for (const name of names) {
    // <meta property="og:title" content="…"> in either attribute order
    const a = html.match(
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')
    );
    const b = html.match(
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i')
    );
    const value = a?.[1] ?? b?.[1];
    if (value) return decode(value);
  }
  return null;
}

async function fetchPreview(url: string): Promise<Preview | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/html' } });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
    const html = (await res.text()).slice(0, 200_000);
    const title = meta(html, 'og:title', 'twitter:title') ?? decode(html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? '');
    if (!title) return null;
    const rawImage = meta(html, 'og:image', 'twitter:image');
    let image: string | null = null;
    try {
      image = rawImage ? new URL(rawImage, url).toString() : null;
    } catch {
      image = null;
    }
    return {
      title,
      description: meta(html, 'og:description', 'description', 'twitter:description'),
      image: image?.startsWith('https://') ? image : null,
      host: new URL(url).hostname.replace(/^www\./, ''),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function loadPreview(url: string) {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetchPreview(url);
    cache.set(url, pending);
  }
  return pending;
}

/**
 * Title / description / image card for the first link in a message. Native only:
 * browsers block reading other sites (CORS), so the web build shows just the link.
 */
export function LinkPreview({ url, mine }: { url: string; mine: boolean }) {
  const theme = useTheme();
  const [state, setState] = useState<{ url: string; preview: Preview | null } | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    loadPreview(url).then((preview) => active && setState({ url, preview }));
    return () => {
      active = false;
    };
  }, [url]);

  const preview = state?.url === url ? state.preview : null;
  if (!preview) return null;

  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => {})}
      accessibilityRole="link"
      accessibilityLabel={`Open ${preview.title}`}
      style={[styles.card, { backgroundColor: mine ? 'rgba(255,255,255,0.16)' : 'rgba(127,127,127,0.14)' }]}>
      {preview.image ? (
        <Image source={{ uri: preview.image }} style={styles.image} contentFit="cover" transition={150} />
      ) : null}
      <View style={styles.body}>
        <Text style={[styles.title, { color: mine ? '#fff' : theme.text }]} numberOfLines={2}>
          {preview.title}
        </Text>
        {preview.description ? (
          <Text
            style={[styles.description, { color: mine ? 'rgba(255,255,255,0.8)' : theme.textSecondary }]}
            numberOfLines={2}>
            {preview.description}
          </Text>
        ) : null}
        <Text style={[styles.host, { color: mine ? 'rgba(255,255,255,0.7)' : theme.textSecondary }]}>
          {preview.host}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 8, borderRadius: 12, overflow: 'hidden', width: 240, maxWidth: '100%' },
  image: { width: '100%', aspectRatio: 1.91 },
  body: { paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 19 },
  description: { fontSize: 13, lineHeight: 17 },
  host: { fontSize: 12, marginTop: 2 },
});
