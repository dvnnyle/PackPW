import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fetchRecentNotifications } from '../api';
import { getPushToken } from '../push';
import { colors, DESKTOP_BREAKPOINT, fonts } from '../theme';

const POLL_MS = 20_000;
const SHOW_MS = 10_000;

// Colour and icon per kind of notification (same kinds as the Varsler switches; null = test).
const STYLE = {
  hourly: { icon: 'trending-up', color: '#22c55e' },
  closing: { icon: 'moon', color: '#22c55e' },
  weekly: { icon: 'bar-chart', color: '#22c55e' },
  bookings: { icon: 'calendar', color: colors.funbutler },
  newBooking: { icon: 'balloon', color: colors.funbutler },
  bookingSoon: { icon: 'alarm', color: colors.funbutler },
  punchIn: { icon: 'person-add', color: '#3b82f6' },
  punchOut: { icon: 'exit', color: '#3b82f6' },
  missingPunch: { icon: 'alert-circle', color: '#f59e0b' },
  weather: { icon: 'rainy', color: '#38bdf8' },
  null: { icon: 'notifications', color: '#a78bfa' },
};

// Toasts shown only in this browser (the "Vis testmelding her" button): one example of each kind, in turn.
const EXAMPLES = [
  { kind: 'hourly', title: '📈 Playworld Sørlandet', body: '💰 Totalt salg i dag: 8 412,50 kr' },
  { kind: 'newBooking', title: '🎈 Ny booking', body: 'lør 18. okt kl 12:30 · 👥 14 gjester · Fiestarommet + Lek' },
  { kind: 'punchIn', title: '👋 Ola Nordmann er på jobb', body: '⏰ Stemplet inn 09:48 · Resepsjon · vakt 09:50–16:00' },
  { kind: 'missingPunch', title: '⚠️ Kari Nordmann har ikke stemplet inn', body: 'Resepsjon · vakt 16:00–21:00 · startet for 10 min siden' },
  { kind: 'bookingSoon', title: '⏰ Om 30 min: Fiestarommet + Lek', body: 'kl 12:30–14:30 · 👥 9 gjester · 🎂 1 bursdagsbarn' },
  { kind: 'weather', title: '🌧️ Regn i morgen', body: '☔ Ca. 6,4 mm regn i åpningstiden (10–21) – det kan bli travelt inne' },
  { kind: 'weekly', title: '📊 Uka er over', body: '💰 Totalt 142 300 kr · man 5. okt – søn 11. okt' },
  { kind: 'closing', title: '🌙 Stengt for i dag', body: '💰 Totalt salg i dag: 12 447,00 kr' },
];
// ---------- sound: a short two-note "ding" made with the Web Audio API (no sound file) ----------
// On/off per browser ("Lyd" on the Varsler page), remembered in localStorage; on by default.
const SOUND_KEY = 'playworld-web-sound';
export function getWebSound() {
  try {
    return globalThis.localStorage?.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setWebSound(on) {
  try {
    globalThis.localStorage?.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked: the choice just isn't remembered
  }
}

let audio = null;
function ping(kind) {
  if (Platform.OS !== 'web' || !getWebSound()) return;
  try {
    const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContext) return;
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume(); // browsers only allow sound after the page has been clicked
    // A rising "ding-ding"; a falling one for warnings (missing punch-in).
    const notes = kind === 'missingPunch' ? [784, 587] : [880, 1319];
    notes.forEach((frequency, i) => {
      const start = audio.currentTime + i * 0.13;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  } catch {
    // no audio available: toasts still show
  }
}

const localListeners = new Set();
let exampleIndex = 0;
let localId = 0;
export function showExampleToast() {
  const example = EXAMPLES[exampleIndex++ % EXAMPLES.length];
  localListeners.forEach((listener) => listener({ ...example, id: `local-${++localId}` }));
}

// One toast: slides in from the left, a bar along the bottom shows how long it stays, slides out when closed.
function Toast({ toast, onDone }) {
  const { icon, color } = STYLE[toast.kind] ?? STYLE.null;
  const [enter] = useState(() => new Animated.Value(0));
  const [life] = useState(() => new Animated.Value(1));
  const closing = useRef(false);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(enter, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(onDone);
  };

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 7, tension: 70, useNativeDriver: false }).start();
    Animated.timing(life, { toValue: 0, duration: SHOW_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished) close();
    });
    // close() only touches refs and animated values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }],
      }}
    >
      <Pressable style={({ hovered }) => [styles.toast, hovered && styles.toastHover]} onPress={close} accessibilityRole="alert">
        <View style={[styles.glow, { backgroundColor: color }]} />
        <View style={[styles.icon, { backgroundColor: `${color}26`, borderColor: `${color}66` }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>
              {toast.title}
            </Text>
            <Text style={styles.time}>nå</Text>
          </View>
          <Text style={styles.body}>{toast.body}</Text>
        </View>
        <View style={styles.track}>
          <Animated.View
            style={[styles.bar, { backgroundColor: color, width: life.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

// The website's version of the phone notifications: while the site is open it asks the server every 20 seconds for
// new ones (only the kinds switched on under Varsler for this browser) and shows each as a toast for 10 seconds,
// top left on desktop (under the top bar) and at the top on a phone-sized window. Click a toast to close it.
export default function WebToasts() {
  const [toasts, setToasts] = useState([]);
  const desktop = useWindowDimensions().width >= DESKTOP_BREAKPOINT;
  const after = useRef(null);
  const shown = useRef(new Set()); // ids already shown, so overlapping checks never show one twice

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let stopped = false;
    let busy = false;
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const token = await getPushToken();
        if (!token || stopped) return;
        const { latest, items } = await fetchRecentNotifications(token, after.current);
        after.current = Math.max(after.current ?? 0, latest);
        const fresh = items.filter((n) => !shown.current.has(n.id));
        fresh.forEach((n) => shown.current.add(n.id));
        if (fresh.length && !stopped) {
          setToasts((t) => [...t, ...fresh].slice(-4));
          ping(fresh[fresh.length - 1].kind);
        }
      } catch {
        // offline or server restarting: try again on the next round
      } finally {
        busy = false;
      }
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    const onLocal = (toast) => {
      setToasts((t) => [...t, toast].slice(-4));
      ping(toast.kind);
    };
    localListeners.add(onLocal);
    return () => {
      stopped = true;
      clearInterval(timer);
      localListeners.delete(onLocal);
    };
  }, []);

  if (Platform.OS !== 'web' || !toasts.length) return null;
  return (
    <View style={[styles.stack, desktop ? styles.stackDesktop : styles.stackMobile]} pointerEvents="box-none">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDone={() => setToasts((all) => all.filter((x) => x.id !== t.id))} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', zIndex: 1000, gap: 10 },
  stackDesktop: { top: 84, left: 24, width: 390 },
  stackMobile: { top: 12, left: 12, right: 12 },
  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingBottom: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    cursor: 'pointer',
  },
  toastHover: { backgroundColor: '#f8fafc' },
  // Soft coloured glow in the corner behind the icon.
  glow: { position: 'absolute', left: -40, top: -40, width: 120, height: 120, borderRadius: 60, opacity: 0.12 },
  icon: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  text: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  time: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted, marginTop: 2 },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: colors.border },
  bar: { height: 3 },
});
