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
// On the website there's no push: the browser gets its own id ("web:…", kept in localStorage) so it has its own
// Varsler choices, and the same notifications are shown as toasts while the site is open (WebToasts).
const WEB_ID_KEY = 'playworld-web-id';
function webId() {
  try {
    let id = globalThis.localStorage?.getItem(WEB_ID_KEY);
    if (!id) {
      id = `web:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      globalThis.localStorage?.setItem(WEB_ID_KEY, id);
    }
    return id;
  } catch {
    return null; // storage blocked (private mode): no toasts or choices
  }
}

let webIdPromise = null;
export const getPushToken = () => {
  if (Platform.OS !== 'web') return tokenPromise;
  webIdPromise ??= (async () => {
    const id = webId();
    if (!id) return null;
    await registerPushToken(id);
    return id;
  })().catch(() => {
    webIdPromise = null; // try again next time
    return null;
  });
  return webIdPromise;
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
