import { createElement } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { cardShadow, colors, fonts } from '../theme';
import { addDays, DAYS, MONTHS, parseDate, toDateString } from '../format';

const LabelWrapper = Platform.OS === 'android' ? Pressable : View;

// ‹ date › bar with a native date picker on the label. Optional `min`/`max` (YYYY-MM-DD) limit the range.
// `inset` = grey, flat version for use inside a white card (like FunButler's day bar).
export default function DateFilter({ date, onChange, min, max, inset }) {
  const d = parseDate(date);
  const today = toDateString(new Date());
  const label = `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const relative =
    date === today ? 'I dag' : date === addDays(today, -1) ? 'I går' : date === addDays(today, 1) ? 'I morgen' : 'Valgt dag';
  const atMin = min != null && date <= min;
  const atMax = max != null && date >= max;
  const limits = { minimumDate: min ? parseDate(min) : undefined, maximumDate: max ? parseDate(max) : undefined };

  const pick = (event, picked) => {
    if (event?.type !== 'dismissed' && picked) onChange(toDateString(picked));
  };

  // Web: a real <input type="date"> laid invisibly over the label, so a click opens the browser's picker.
  // Android: the system dialog. iOS: the compact picker, which shows the date and opens a calendar itself.
  let picker = null;
  if (Platform.OS === 'web') {
    picker = createElement('input', {
      type: 'date',
      value: date,
      min,
      max,
      onChange: (e) => e.target.value && onChange(e.target.value),
      'aria-label': 'Velg dato',
      style: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' },
    });
  } else if (Platform.OS === 'ios') {
    picker = <DateTimePicker value={d} mode="date" display="compact" {...limits} onChange={pick} />;
  }

  return (
    <View style={[styles.bar, inset && styles.inset]}>
      <Pressable
        style={[styles.arrow, atMin && styles.disabled]}
        onPress={() => onChange(addDays(date, -1))}
        disabled={atMin}
        hitSlop={8}
        accessibilityLabel="Forrige dag"
      >
        <Text style={styles.arrowText}>‹</Text>
      </Pressable>

      {/* Only Android needs a press handler; elsewhere a disabled Pressable would block the picker inside it. */}
      <LabelWrapper
        style={styles.label}
        onPress={() =>
          DateTimePickerAndroid.open({ value: d, mode: 'date', ...limits, onChange: pick })
        }
      >
        <Text style={styles.relative}>{relative} · trykk for å velge</Text>
        {Platform.OS === 'ios' ? picker : <Text style={styles.dateText}>{label}</Text>}
        {Platform.OS === 'web' ? picker : null}
      </LabelWrapper>

      <Pressable
        style={[styles.arrow, atMax && styles.disabled]}
        onPress={() => onChange(addDays(date, 1))}
        disabled={atMax}
        hitSlop={8}
        accessibilityLabel="Neste dag"
      >
        <Text style={styles.arrowText}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 8,
    ...cardShadow,
  },
  inset: { backgroundColor: '#f6f7f9', borderRadius: 14, borderWidth: 1, borderColor: colors.border, shadowOpacity: 0, elevation: 0 },
  arrow: { paddingHorizontal: 16, paddingVertical: 4 },
  arrowText: { fontFamily: fonts.regular, fontSize: 36, color: colors.text, lineHeight: 40 },
  disabled: { opacity: 0.25 },
  label: { flex: 1, alignItems: 'center', gap: 2 },
  relative: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  dateText: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text },
});
