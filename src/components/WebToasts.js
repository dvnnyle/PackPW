import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fetchRecentNotifications } from '../api';
import { getPushToken } from '../push';
import { cardShadow, colors, DESKTOP_BREAKPOINT, fonts } from '../theme';

const POLL_MS = 20_000;
const SHOW_MS = 10_000;

// The website's version of the phone notifications: while the site is open it asks the server every 20 seconds for
// new ones (only the kinds switched on under Varsler for this browser) and shows each as a toast for 10 seconds.
// Click a toast to close it.
export default function WebToasts() {
  const [toasts, setToasts] = useState([]);
  const desktop = useWindowDimensions().width >= DESKTOP_BREAKPOINT;
  const after = useRef(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let stopped = false;
    const poll = async () => {
      const token = await getPushToken();
      if (!token || stopped) return;
      try {
        const { latest, items } = await fetchRecentNotifications(token, after.current);
        after.current = latest;
        if (!items.length || stopped) return;
        setToasts((t) => [...t, ...items].slice(-4));
        for (const item of items) {
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== item.id)), SHOW_MS);
        }
      } catch {
        // offline or server restarting: try again on the next round
      }
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  if (Platform.OS !== 'web' || !toasts.length) return null;
  return (
    <View style={[styles.stack, desktop ? styles.stackDesktop : styles.stackMobile]} pointerEvents="box-none">
      {toasts.map((t) => (
        <Pressable
          key={t.id}
          style={styles.toast}
          onPress={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
          accessibilityRole="alert"
        >
          <View style={styles.icon}>
            <Ionicons name="notifications" size={16} color={colors.accent} />
          </View>
          <View style={styles.text}>
            <Text style={styles.title}>{t.title}</Text>
            <Text style={styles.body}>{t.body}</Text>
          </View>
          <Ionicons name="close" size={16} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', zIndex: 1000, gap: 10 },
  stackDesktop: { top: 84, right: 24, width: 380 },
  stackMobile: { top: 12, left: 12, right: 12 },
  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    ...cardShadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  icon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
});
