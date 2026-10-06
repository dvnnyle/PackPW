import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { cardShadow, colors } from '../theme';

// Grey placeholder block that gently pulses while data loads.
export function SkeletonBlock({ height = 14, width = '100%', radius = 8, style }) {
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: '#e5e7eb', opacity }, style]} />;
}

// A few placeholder rows shaped like the list rows inside a section (bookings, shifts).
export function SkeletonRows({ count = 3, height = 64 }) {
  return Array.from({ length: count }, (_, i) => <SkeletonBlock key={i} height={height} radius={14} />);
}

// Placeholder for a whole section card: same white card, title bar, then tiles of the given heights.
// Pass `accent` for the blue "Totalt salg" card.
export function SkeletonCard({ tiles = [], accent, height }) {
  if (accent) {
    return (
      <View style={[styles.accent, height && { height }]}>
        <SkeletonBlock width="40%" height={12} style={styles.onAccent} />
        <SkeletonBlock width="60%" height={40} style={styles.onAccent} />
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <SkeletonBlock width="45%" height={20} />
      {tiles.map((h, i) => (
        <SkeletonBlock key={i} height={h} radius={14} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 10, marginTop: 4, ...cardShadow },
  accent: { backgroundColor: colors.accent, borderRadius: 20, padding: 20, gap: 12, minHeight: 170 },
  onAccent: { backgroundColor: '#3b82f6' },
});
