import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  useFonts,
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { Syne_700Bold, Syne_800ExtraBold } from '@expo-google-fonts/syne';
import { colors, DESKTOP_BREAKPOINT, fonts, SIDEBAR_WIDTH } from '../theme';
import { canSelfUpdate, checkForUpdate } from '../updates';
import UpdateDialog from '../components/UpdateDialog';
import LocationPicker from '../components/LocationPicker';
import { LocationProvider } from '../location';

// Keep the splash screen up until the fonts are loaded.
SplashScreen.preventAutoHideAsync();

const logo = require('../../assets/branding/logo.png');

// The four main tabs. Add a screen file in src/app/ with the same name to create a new one.
const TABS = [
  { name: 'index', href: '/', label: 'Oversikt', icon: 'home' },
  { name: 'bookinger', href: '/bookinger', label: 'Bookinger', icon: 'calendar' },
  { name: 'statistikk', href: '/statistikk', label: 'Statistikk', icon: 'stats-chart' },
  { name: 'innstillinger', href: '/innstillinger', label: 'Innstillinger', icon: 'settings' },
];

// One menu item; rendered as a sidebar row on desktop and a bottom-bar button on mobile.
function NavButton({ tab, desktop, isFocused, ...props }) {
  const color = isFocused ? colors.accent : colors.muted;
  return (
    <Pressable
      {...props}
      style={[
        desktop ? styles.sideItem : styles.bottomItem,
        desktop && isFocused && styles.sideItemActive,
      ]}
    >
      <Ionicons name={isFocused ? tab.icon : `${tab.icon}-outline`} size={desktop ? 20 : 24} color={color} />
      <Text style={[desktop ? styles.sideLabel : styles.bottomLabel, { color }]}>{tab.label}</Text>
    </Pressable>
  );
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
  const menu = (
    <View style={desktop ? styles.sidebar : [styles.bottomBar, { paddingBottom: insets.bottom + 6 }]}>
      {desktop ? <Image source={logo} style={styles.sidebarLogo} resizeMode="contain" /> : null}
      {desktop ? (
        <View style={styles.sidebarLocation}>
          <LocationPicker />
        </View>
      ) : null}
      {TABS.map((tab) => (
        <TabTrigger key={tab.name} name={tab.name} asChild>
          <NavButton tab={tab} desktop={desktop} />
        </TabTrigger>
      ))}
    </View>
  );

  return (
    <LocationProvider>
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
        {/* Desktop: sidebar | content.  Mobile: logo bar / content / bottom tab bar. */}
        <View style={[styles.frame, desktop && styles.frameDesktop]}>
          {desktop ? null : (
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
              <Image source={logo} style={styles.topBarLogo} resizeMode="contain" />
              <LocationPicker />
            </View>
          )}

          {desktop ? menu : null}

          <View style={styles.content}>
            <TabSlot style={styles.slot} />
          </View>

          {desktop ? null : menu}
        </View>
      </Tabs>
    </LocationProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: colors.background },
  // minHeight: 0 lets these flex children shrink to the window on web, so the screen's ScrollView scrolls
  // instead of growing to its full content height.
  frame: { flex: 1, minHeight: 0 },
  frameDesktop: { flexDirection: 'row' },
  hidden: { display: 'none' },
  content: { flex: 1, minHeight: 0, overflow: 'hidden' },
  // TabSlot's container defaults to flexShrink: 0, which lets screens grow past the window on web.
  slot: { flexShrink: 1, flexBasis: 0, minHeight: 0 },

  topBar: {
    alignItems: 'center',
    gap: 4,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topBarLogo: { width: 90, height: 40 },
  sidebarLocation: { marginBottom: 16 },

  bottomBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  bottomItem: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  bottomLabel: { fontFamily: fonts.medium, fontSize: 11 },

  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 20,
    gap: 4,
    flexDirection: 'column',
  },
  sidebarLogo: { width: 140, height: 115, alignSelf: 'center', marginBottom: 16 },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  sideItemActive: { backgroundColor: colors.accentSoft },
  sideLabel: { fontFamily: fonts.medium, fontSize: 15 },
});
