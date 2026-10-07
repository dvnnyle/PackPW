// In-app updates for the private Android APK (not Google Play).
// Shared part: ask the backend for the latest build and compare Android versionCodes.
// Android-only part: download the new APK and hand it to Android's package installer, which asks the user
// to confirm and installs it over the current app (same package ID + same EAS signing key = data is kept).
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import { ActivityAction, startActivityAsync } from 'expo-intent-launcher';
import { fetchAppVersion } from './api';

const CHECK_CACHE_MS = 30 * 60_000;
let lastCheck = null; // { at, result }

// The version that is actually installed (from the native build, not hard-coded).
export function installedVersion() {
  return {
    version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null,
    versionCode: Number(Application.nativeBuildVersion) || null,
  };
}

// The version as people see it. From 1.0.5 on, the last number IS the Android build code ("1.0.5" = build 5),
// so it's shown alone; older builds whose name didn't match show the code too, e.g. "1.0.0 (3)".
export function versionLabel(version, versionCode) {
  if (!version) return versionCode ? `bygg ${versionCode}` : '–';
  if (!versionCode || version.endsWith(`.${versionCode}`)) return version;
  return `${version} (${versionCode})`;
}

// Installed from Google Play (EAS profile "production"): updates come through Play, never as an APK.
export const fromPlayStore = process.env.EXPO_PUBLIC_DISTRIBUTION === 'play';

// Only the private Android APK updates itself. Not web, not iOS (that will be TestFlight), not the Google Play
// version, and not Expo Go, where the "installed version" would be Expo Go's own.
export const canSelfUpdate =
  Platform.OS === 'android' && Constants.executionEnvironment !== 'storeClient' && !fromPlayStore;

// → { updateAvailable, installed, version, versionCode, apkUrl, mandatory, releaseNotes }
// Cached for 30 minutes unless `force` (the Settings button).
export async function checkForUpdate({ force = false } = {}) {
  if (!force && lastCheck && Date.now() - lastCheck.at < CHECK_CACHE_MS) return lastCheck.result;
  const latest = await fetchAppVersion();
  const installed = installedVersion();
  const result = {
    ...latest,
    installed,
    // Compare integer versionCodes, never version strings ("1.0.10" < "1.0.9" as text).
    updateAvailable: !!latest.apkUrl && installed.versionCode != null && latest.versionCode > installed.versionCode,
  };
  lastCheck = { at: Date.now(), result };
  return result;
}

// Downloads the APK (onProgress gets 0–1) and opens Android's installer for it.
export async function downloadAndInstall(update, onProgress) {
  const file = new File(Paths.cache, `playworld-${update.versionCode}.apk`);
  if (file.exists) file.delete();
  const task = File.createDownloadTask(update.apkUrl, file, {
    onProgress: ({ bytesWritten, totalBytes }) => totalBytes > 0 && onProgress?.(bytesWritten / totalBytes),
  });
  await task.downloadAsync();
  onProgress?.(1);

  // The installer needs a content:// URI it is allowed to read (FLAG_GRANT_READ_URI_PERMISSION = 1).
  const contentUri = await getContentUriAsync(file.uri);
  await startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1,
  });
}

// Android's "Install unknown apps" switch for this app, if the installer was blocked.
export function openInstallPermissionSettings() {
  return startActivityAsync(ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
    data: `package:${Application.applicationId}`,
  });
}
