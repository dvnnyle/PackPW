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

export async function registerForPush() {
  if (Platform.OS === 'web') return;
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
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(token);
  } catch (err) {
    console.warn('[push] Registration failed:', err?.message);
  }
}
