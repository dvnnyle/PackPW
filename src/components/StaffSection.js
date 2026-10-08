import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { fetchStaff } from '../api';
import { cardShadow, colors, fonts } from '../theme';
import { toDateString } from '../format';
import DateFilter from './DateFilter';
import { logos } from '../logos';
import { SkeletonRows } from './Skeleton';

const REFRESH_INTERVAL_MS = 60_000;

// Clock-in state from Planday's punch clock, shown under the name.
function punchText(shift) {
  if (shift.punchIn && shift.punchOut) return { text: `Ferdig · ${shift.punchIn}–${shift.punchOut}`, color: colors.muted };
  if (shift.punchIn) return { text: `Stemplet inn ${shift.punchIn}`, color: '#15803d' };
  return null;
}

function ShiftRow({ shift }) {
  const punch = punchText(shift);
  return (
    <View style={styles.row}>
      <View style={styles.time}>
        <Text style={styles.start}>{shift.start}</Text>
        <Text style={styles.muted}>{shift.end}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, !shift.name && styles.open]}>{shift.name ?? 'Ledig vakt'}</Text>
        {punch ? <Text style={[styles.punch, { color: punch.color }]}>{punch.text}</Text> : null}
      </View>
      {shift.group ? (
        <View style={styles.chip}>
          <Text style={styles.chipText}>{shift.group}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Who is working on a chosen day (today by default), from Planday.
export default function StaffSection({ refreshKey, locationId }) {
  const today = toDateString(new Date());
  const [date, setDate] = useState(today);
  const [result, setResult] = useState(null); // { date, shifts }
  const [failedDate, setFailedDate] = useState(null); // the day whose load failed

  // A changed refreshKey means the user pressed refresh: skip the backend cache for that load.
  const seenRefreshKey = useRef(refreshKey);
  useEffect(() => {
    const load = (fresh) =>
      fetchStaff(date, fresh, (saved) => setResult((r) => (r?.date === date ? r : saved)), locationId)
        .then((d) => (setResult(d), setFailedDate(null)))
        .catch(() => setFailedDate(date));
    load(seenRefreshKey.current !== refreshKey);
    seenRefreshKey.current = refreshKey;
    const timer = setInterval(() => load(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [date, refreshKey, locationId]);

  // Only show data for the chosen day; a slow response for a previous day is ignored.
  const shifts = result?.date === date ? result.shifts : null;
  const staffed = shifts?.filter((s) => s.name) ?? [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Image source={logos.planday} style={styles.logo} accessibilityLabel="Planday" />
        <Text style={styles.title}>{date === today ? 'På jobb i dag' : 'På jobb'}</Text>
        {shifts ? <Text style={styles.count}>{staffed.length} ansatte</Text> : null}
      </View>

      <DateFilter date={date} onChange={setDate} inset />

      {!shifts && failedDate === date ? (
        <Text style={styles.error}>Kunne ikke hente vaktplanen fra Planday</Text>
      ) : !shifts ? (
        <SkeletonRows count={4} height={64} />
      ) : shifts.length === 0 ? (
        <Text style={styles.muted}>Ingen vakter denne dagen</Text>
      ) : (
        shifts.map((s, i) => <ShiftRow key={`${s.start}-${s.name}-${i}`} shift={s} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 10, marginTop: 4, ...cardShadow },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 24, height: 24 },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.text, flex: 1 },
  count: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f6f7f9', borderRadius: 14, padding: 12 },
  time: { alignItems: 'center', minWidth: 48 },
  start: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  info: { flex: 1 },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  open: { color: colors.muted, fontStyle: 'italic' },
  punch: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  chip: { backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: fonts.medium, fontSize: 12, color: '#1e40af' },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  error: { fontFamily: fonts.regular, fontSize: 13, color: '#b91c1c' },
});
