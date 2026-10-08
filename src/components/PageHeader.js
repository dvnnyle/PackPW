import { useEffect, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
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

// Page title with an info pill underneath (icon or live dot + short text). The pill keeps its space while
// `subtitle` is still loading, so the page below doesn't jump.
// `logo` (an image source) shows a small service logo before the title; `accent` recolours the icon.
// Reloading is global now: the button sits in the top bar / sidebar.
// Title, status and any children (the date bar) are grouped and framed by four L-shaped corners on every page.
// `compact`: everything in one row (title and pill on the left, children on the right), for the desktop Oversikt.
export default function PageHeader({ title, subtitle, icon, live, logo, accent = colors.accent, compact, children }) {
  return (
    <View style={[styles.header, styles.card, compact && styles.compact]}>
      <View style={styles.row}>
        {logo ? <Image source={logo} style={styles.logo} accessibilityIgnoresInvertColors /> : null}
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
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
      </View>
      {children ? <View style={compact ? styles.childrenCompact : styles.children}>{children}</View> : null}
      <View style={[styles.corner, styles.cornerTL]} />
      <View style={[styles.corner, styles.cornerTR]} />
      <View style={[styles.corner, styles.cornerBL]} />
      <View style={[styles.corner, styles.cornerBR]} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 8, marginBottom: 4 },
  card: { padding: 16, paddingTop: 18 },
  // L-shaped corner marks around the grouped header (not a full frame).
  corner: { position: 'absolute', width: 22, height: 22, borderColor: colors.accent },
  cornerTL: { top: 0, left: 0, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 2.5, borderRightWidth: 2.5, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 2.5, borderLeftWidth: 2.5, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderBottomRightRadius: 12 },
  children: { alignSelf: 'stretch', marginTop: 6 },
  compact: { flexDirection: 'row', gap: 16, marginBottom: 0, paddingVertical: 12 },
  titleCompact: { fontSize: 26 },
  childrenCompact: { flex: 1, maxWidth: 560, marginLeft: 'auto' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 34, height: 34 },
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
