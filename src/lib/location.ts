import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

function locationError(code: string) {
  return Object.assign(new Error(code), { code });
}

/** Asks for "while using" permission and returns the current position. */
export async function getCurrentCoords() {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (!granted) throw locationError('location/permission');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

/** Apple Maps on iPhone (no API key needed); Google Maps elsewhere. */
export function mapsUrl(lat: number, lng: number) {
  return Platform.OS === 'ios'
    ? `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent('Shared location')}`
    : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function openInMaps(lat: number, lng: number) {
  Linking.openURL(mapsUrl(lat, lng)).catch(() => {});
}

export function locationErrorMessage(err: unknown) {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'location/permission') return 'Allow location access in Settings to share where you are.';
  if (code === 'permission-denied') return 'Sending was blocked by the database security rules.';
  return 'Could not get your location. Try again outside or with Wi-Fi on.';
}
