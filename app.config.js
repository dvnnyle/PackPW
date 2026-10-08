// Builds for Google Play (EAS profile "production") must not install app updates themselves (Play policy), so
// they drop the install-packages permission. The private APK (profile "preview") keeps it for its in-app updates.
// Firebase config for push notifications (FCM): an EAS file variable GOOGLE_SERVICES_JSON in builds, or a local
// google-services.json (git-ignored; the repo is public).
const fs = require('node:fs');

module.exports = ({ config }) => {
  const googleServices = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
  if (fs.existsSync(googleServices)) config.android.googleServicesFile = googleServices;
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    config.android.permissions = (config.android.permissions ?? []).filter((p) => !p.endsWith('REQUEST_INSTALL_PACKAGES'));
  }
  return config;
};
