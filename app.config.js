// Builds for Google Play (EAS profile "production") must not install app updates themselves (Play policy), so
// they drop the install-packages permission. The private APK (profile "preview") keeps it for its in-app updates.
module.exports = ({ config }) => {
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    config.android.permissions = (config.android.permissions ?? []).filter((p) => !p.endsWith('REQUEST_INSTALL_PACKAGES'));
  }
  return config;
};
