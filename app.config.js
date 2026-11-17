// Extends app.json. With SIDELOAD=1 (the GitHub Actions .ipa build), removes the
// push-notification capability: a free Apple ID can't sign apps that use it, so
// Sideloadly would fail. Everything else stays the same.
module.exports = ({ config }) => {
  if (process.env.SIDELOAD !== '1') return config;

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
    extra: { ...config.extra, sideload: true },
  };
};
