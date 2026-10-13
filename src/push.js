import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { registerPushToken } from './api';

// Asks for permission to show notifications and sends this phone's Expo push token to the backend, which uses it
// for the staff notifications. Runs after login and on every app start (the backend's list may be reset by a
// deploy). Phone app only; failures (no permission, emulator, no network) are ignored.
// Show notifications (with sound) even while the app is open; by default they're only shown when it's closed.
if (Platform.OS !== 'web') {
  require('expo-notifications').setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// This phone's Expo push token once registration has finished (null on the web or without permission). Waits for
// the first registration, so a screen opened right after login doesn't wrongly see "no notifications".
let resolveToken;
const tokenPromise = new Promise((resolve) => (resolveToken = resolve));
// Local development on the web (localhost:8081) gets a stand-in token, so the Varsler switches can be seen and tried
// without a phone. The real website has no push notifications.
const WEB_PREVIEW_TOKEN = 'ExponentPushToken[webPreview]';
export const getPushToken = () => {
  if (Platform.OS !== 'web') return tokenPromise;
  if (!__DEV__) return Promise.resolve(null);
  return registerPushToken(WEB_PREVIEW_TOKEN).then(() => WEB_PREVIEW_TOKEN);
};

export function registerForPush() {
  return register().then((token) => (resolveToken(token), token));
}

async function register() {
  if (Platform.OS === 'web') return null;
  try {
    const Notifications = require('expo-notifications');
    if (Platform.OS === 'android') {
      // A channel's importance can't be raised once created, so this is a new one ("default" from 1.0.20 popped
      // up silently). MAX = shown as a pop-up with sound.
      await Notifications.setNotificationChannelAsync('varsler', {
        name: 'Varsler',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
      await Notifications.deleteNotificationChannelAsync('default').catch(() => {});
    }
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(token);
    return token;
  } catch (err) {
    console.warn('[push] Registration failed:', err?.message);
    return null;
  }
}
