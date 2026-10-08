import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Head from 'expo-router/head';
import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {
  useFonts,
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { Syne_700Bold, Syne_800ExtraBold } from '@expo-google-fonts/syne';
import { accentShadow, colors, DESKTOP_BREAKPOINT, fonts } from '../theme';
import { canSelfUpdate, checkForUpdate } from '../updates';
import UpdateDialog from '../components/UpdateDialog';
import LocationPicker from '../components/LocationPicker';
import { LocationProvider } from '../location';
import { RefreshProvider } from '../refresh';
import RefreshButton from '../components/RefreshButton';
import LoginScreen from '../components/LoginScreen';
import { AuthProvider, useAuth } from '../auth';

// Keep the splash screen up until the fonts are loaded.
SplashScreen.preventAutoHideAsync();

// The normal Playworld logo, also on the login screen and as favicon.
const logo = require('../../assets/branding/logo.png');

// The main tabs. Add a screen file in src/app/ with the same name to create a new one.
const TABS = [
  { name: 'index', href: '/', label: 'Oversikt', icon: 'rocket' },
  { name: 'bookinger', href: '/bookinger', label: 'Bookinger', icon: 'calendar' },
  { name: 'statistikk', href: '/statistikk', label: 'Statistikk', icon: 'stats-chart' },
  { name: 'vaer', href: '/vaer', label: 'Været', icon: 'partly-sunny' },
  { name: 'innstillinger', href: '/innstillinger', label: 'Innstillinger', icon: 'settings' },
];
// Phone bottom bar: Oversikt in the middle of the five. The desktop top bar keeps the order above.
const BOTTOM_TABS = ['bookinger', 'statistikk', 'index', 'vaer', 'innstillinger'].map((n) => TABS.find((t) => t.name === n));

// One menu item; a pill in the desktop top bar, a bottom-bar button on mobile.
// On the phone, Oversikt (the middle tab) sits in a raised blue circle.
function NavButton({ tab, desktop, isFocused, onPress, ...props }) {
  const color = isFocused ? colors.accent : colors.muted;
  const featured = !desktop && tab.name === 'index';
  // A short vibration on the phone: a tick for the tabs, a firmer tap for the rocket.
  const press = (e) => {
    if (Platform.OS !== 'web') {
      (featured ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) : Haptics.selectionAsync()).catch(() => {});
    }
    onPress?.(e);
  };
  return (
    <Pressable
      {...props}
      onPress={press}
      style={[
        desktop ? styles.navItem : styles.bottomItem,
        desktop && isFocused && styles.navItemActive,
      ]}
    >
      {featured ? (
        <View style={styles.featured}>
          <Ionicons name={tab.icon} size={30} color="#fff" />
        </View>
      ) : (
        <Ionicons name={isFocused ? tab.icon : `${tab.icon}-outline`} size={desktop ? 20 : 24} color={color} />
      )}
      <Text style={[desktop ? styles.navLabel : styles.bottomLabel, { color }]}>{tab.label}</Text>
    </Pressable>
  );
}

// The login screen until the user has logged in (phone and website alike).
function AuthGate({ children }) {
  const { token } = useAuth();
  if (!token) {
    return (
      <>
        <StatusBar style="dark" />
        <LoginScreen />
      </>
    );
  }
  return children;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Syne_700Bold,
    Syne_800ExtraBold,
  });
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = width >= DESKTOP_BREAKPOINT;

  // Check for a new APK once in the background at start; the app works normally meanwhile, and a
  // failed check (server down, no network) is simply ignored.
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    if (!canSelfUpdate) return;
    checkForUpdate()
      .then((result) => result.updateAvailable && setUpdate(result))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // If fonts fail to load, carry on with the system font rather than a blank screen.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  // Visible menu. Its triggers have no href: they switch to the tabs registered in the hidden TabList below.
  const tabs = (desktop ? TABS : BOTTOM_TABS).map((tab) => (
    <TabTrigger key={tab.name} name={tab.name} asChild>
      <NavButton tab={tab} desktop={desktop} />
    </TabTrigger>
  ));
  // Desktop: one bar across the top (logo | tabs | location + reload), so the pages get the full width.
  const menu = desktop ? (
    <View style={styles.topNav}>
      <Image source={logo} style={styles.topNavLogo} resizeMode="contain" />
      <View style={styles.topNavTabs}>{tabs}</View>
      <View style={styles.topNavRight}>
        <LocationPicker />
        <RefreshButton />
      </View>
    </View>
  ) : (
    <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 6 }]}>{tabs}</View>
  );

  return (
    <AuthProvider>
    {/* Browser tab title on the website (same on every page). */}
    <Head>
      <title>Playworld Hub</title>
    </Head>
    <AuthGate>
    <LocationProvider>
    <RefreshProvider>
      <Tabs style={styles.root}>
        {/* Expo Router needs the TabList as a direct child of Tabs to register the routes;
            it's hidden so the menu can be laid out differently on desktop and mobile. */}
        <TabList style={styles.hidden}>
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} />
          ))}
        </TabList>
        <StatusBar style="dark" />
        <UpdateDialog update={update} onClose={() => setUpdate(null)} />
        {/* Desktop: top nav bar / content.  Mobile: logo bar / content / bottom tab bar. */}
        <View style={styles.frame}>
          {desktop ? null : (
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
              {/* Picker on the left, logo centred over the full width. */}
              <View style={styles.topBarRow}>
                <Image source={logo} style={styles.topBarLogo} resizeMode="contain" />
                <View style={styles.topBarLeft}>
                  <LocationPicker />
                </View>
                <View style={styles.topBarRight}>
                  <RefreshButton />
                </View>
              </View>
            </View>
          )}

          {desktop ? menu : null}

          <View style={styles.content}>
            <TabSlot style={styles.slot} />
          </View>

          {desktop ? null : menu}
        </View>
      </Tabs>
    </RefreshProvider>
    </LocationProvider>
    </AuthGate>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: colors.background },
  // minHeight: 0 lets these flex children shrink to the window on web, so the screen's ScrollView scrolls
  // instead of growing to its full content height.
  frame: { flex: 1, minHeight: 0 },
  hidden: { display: 'none' },
  content: { flex: 1, minHeight: 0, overflow: 'hidden' },
  // TabSlot's container defaults to flexShrink: 0, which lets screens grow past the window on web.
  slot: { flexShrink: 1, flexBasis: 0, minHeight: 0 },

  topBar: {
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topBarRow: { height: 52, justifyContent: 'center', alignItems: 'center' },
  topBarLogo: { width: 110, height: 48 },
  topBarLeft: { position: 'absolute', left: 12, top: 0, bottom: 0, justifyContent: 'center' },
  topBarRight: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },

  bottomBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  bottomItem: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  bottomLabel: { fontFamily: fonts.medium, fontSize: 11 },
  // Raised circle for Oversikt, sticking out above the bar's top edge.
  featured: {
    width: 66,
    height: 66,
    borderRadius: 33,
    marginTop: -38,
    marginBottom: -2,
    backgroundColor: colors.accent,
    borderWidth: 4,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...accentShadow,
  },

  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    height: 72,
    paddingHorizontal: 24,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topNavLogo: { width: 72, height: 56 },
  topNavTabs: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  topNavRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999 },
  navItemActive: { backgroundColor: colors.accentSoft },
  navLabel: { fontFamily: fonts.medium, fontSize: 15 },
});
