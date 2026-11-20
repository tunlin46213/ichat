// React Native Firebase Messaging's library manifest sets the FCM default notification
// colour to @color/white, and expo-notifications sets the same <meta-data> in the app
// manifest to our accent colour. The manifest merger refuses to pick one, so mark the
// app's value as the one that wins (tools:replace).
const { withAndroidManifest } = require('expo/config-plugins');

const NAMES = ['com.google.firebase.messaging.default_notification_color'];

module.exports = function withFirebaseManifestFix(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ ?? {};
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';
    const app = manifest.application?.[0];
    for (const meta of app?.['meta-data'] ?? []) {
      if (NAMES.includes(meta.$['android:name']) && meta.$['android:resource']) {
        meta.$['tools:replace'] = 'android:resource';
      }
    }
    return cfg;
  });
};
