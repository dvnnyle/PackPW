import { useEffect, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts } from '../theme';

// Small green dot that pulses, for "live" data that refreshes by itself.
function LiveDot() {
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.6, duration: 900, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [scale]);
  return (
    <View style={styles.dotWrap}>
      <Animated.View style={[styles.dotHalo, { transform: [{ scale }] }]} />
      <View style={styles.dot} />
    </View>
  );
}

// Round refresh button; the icon spins while a refresh is running.
function RefreshButton({ onPress, refreshing, color = colors.accent }) {
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!refreshing) return undefined;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [refreshing, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Pressable
      style={({ pressed }) => [styles.refresh, pressed && styles.refreshPressed]}
      onPress={onPress}
      disabled={refreshing}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Oppdater nå"
    >
      <Animated.View style={{ transform: [{ rotate: refreshing ? rotate : '0deg' }] }}>
        <Ionicons name="refresh" size={16} color={color} />
      </Animated.View>
    </Pressable>
  );
}

// Page title with an info pill underneath (icon or live dot + short text). The pill keeps its space while
// `subtitle` is still loading, so the page below doesn't jump.
// With `onRefresh`, a refresh button sits next to the pill for fetching new data right away.
// `logo` (an image source) shows a small service logo before the title; `accent` recolours the icons.
export default function PageHeader({ title, subtitle, icon, live, onRefresh, refreshing, logo, accent = colors.accent }) {
  return (
    <View style={styles.header}>
      <View style={styles.row}>
        {logo ? <Image source={logo} style={styles.logo} accessibilityIgnoresInvertColors /> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.row}>
        <View style={[styles.pill, !subtitle && styles.pillEmpty]}>
          {subtitle ? (
            <>
              {live ? <LiveDot /> : <Ionicons name={icon} size={14} color={accent} />}
              <Text style={styles.pillText}>{subtitle}</Text>
            </>
          ) : null}
        </View>
        {onRefresh ? <RefreshButton onPress={onRefresh} refreshing={refreshing} color={accent} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 34, height: 34 },
  refresh: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshPressed: { backgroundColor: colors.accentSoft },
  title: { fontFamily: fonts.headingBold, fontSize: 32, color: colors.text, textAlign: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 30,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillEmpty: { minWidth: 160, opacity: 0 },
  pillText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  dotWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16a34a' },
  dotHalo: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#16a34a', opacity: 0.3 },
});
