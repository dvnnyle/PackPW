import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme';
import { useRefresh } from '../refresh';

// Global reload: fetches fresh data for every page and section. The icon spins while it runs.
export default function RefreshButton() {
  const { refreshing, refreshAll } = useRefresh();
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
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={refreshAll}
      disabled={refreshing}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Oppdater alle tall nå"
    >
      <Animated.View style={{ transform: [{ rotate: refreshing ? rotate : '0deg' }] }}>
        <Ionicons name="refresh" size={18} color={colors.accent} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  pressed: { opacity: 0.7 },
});
