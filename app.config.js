const { execSync } = require('child_process');

/** Last commit's time / hash: the "build" shown in Settings and checked against config/app.minBuildTime. */
function git(args) {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

// Extends app.json:
// - stamps the build (commit time + short hash) into extra, on every platform;
// - turns on Stream's call ringing (full-screen incoming call) except for SIDELOAD;
// - with SIDELOAD=1 (the GitHub Actions .ipa build), removes the push-notification
//   capability: a free Apple ID can't sign apps that use it. Everything else stays.
module.exports = ({ config }) => {
  const extra = {
    ...config.extra,
    buildTime: Number(git('log -1 --format=%ct')) || null,
    buildSha: git('rev-parse --short HEAD') || null,
  };
  if (process.env.SIDELOAD !== '1') {
    // Android (and paid-account iOS builds): Stream's ringing setup, which makes an
    // incoming call ring full screen with Accept / Decline even when iChat is closed.
    const plugins = (config.plugins ?? []).map((plugin) =>
      plugin === '@stream-io/video-react-native-sdk' ? ['@stream-io/video-react-native-sdk', { ringing: true }] : plugin
    );
    return { ...config, plugins, extra };
  }

  const plugins = (config.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== 'expo-notifications';
  });

  const infoPlist = { ...(config.ios?.infoPlist ?? {}) };
  infoPlist.UIBackgroundModes = (infoPlist.UIBackgroundModes ?? []).filter(
    (mode) => mode !== 'remote-notification'
  );

  return {
    ...config,
    plugins,
    ios: {
      ...config.ios,
      infoPlist,
      entitlements: { ...(config.ios?.entitlements ?? {}), 'aps-environment': undefined },
    },
    extra: { ...extra, sideload: true },
  };
};
