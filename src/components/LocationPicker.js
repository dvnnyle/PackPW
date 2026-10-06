import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { cardShadow, colors, fonts } from '../theme';
import { LOCATIONS, useLocation } from '../location';

// "Sørlandet ▾" pill; tapping it lists the locations. Locations without backend logins yet are shown greyed out.
export default function LocationPicker() {
  const { location, setLocationId } = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Lokasjon: ${location.name}. Trykk for å bytte`}
      >
        <Ionicons name="location" size={14} color={colors.accent} />
        <Text style={styles.pillText}>{location.name}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Velg lokasjon</Text>
            {LOCATIONS.map((l) => {
              const selected = l.id === location.id;
              return (
                <Pressable
                  key={l.id}
                  style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && l.available && styles.pillPressed]}
                  disabled={!l.available}
                  onPress={() => {
                    setLocationId(l.id);
                    setOpen(false);
                  }}
                  accessibilityState={{ selected, disabled: !l.available }}
                >
                  <Text style={[styles.optionText, !l.available && styles.optionDisabled]}>Playworld {l.name}</Text>
                  {!l.available ? (
                    <Text style={styles.soon}>Kommer snart</Text>
                  ) : selected ? (
                    <Ionicons name="checkmark" size={18} color={colors.accent} />
                  ) : l.demo ? (
                    <Text style={styles.soon}>Demodata</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  pillPressed: { opacity: 0.7 },
  pillText: { fontFamily: fonts.semibold, fontSize: 13, color: '#1e40af' },
  backdrop: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 6, ...cardShadow },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.text, marginBottom: 6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  optionSelected: { backgroundColor: colors.accentSoft },
  optionText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  optionDisabled: { color: colors.muted },
  soon: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
});
