import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { API_URL, fetchUpcomingBookings } from '../api';
import { cardShadow, colors, fonts } from '../theme';
import { addDays, DAYS, MONTHS, parseDate, toDateString } from '../format';
import { SkeletonCard } from './Skeleton';
import DateFilter from './DateFilter';
import PageHeader from './PageHeader';
import { useRefresh } from '../refresh';
import { useLocation } from '../location';
import { BookingRow } from './DashboardScreen';

const REFRESH_INTERVAL_MS = 60_000;
const PAGE_SIZE = 10; // days with bookings per load
const MAX_PAGE = 30; // the backend's limit per request

const guestsOf = (bookings) => bookings.reduce((sum, b) => sum + b.guests, 0);

// The room a booking is for, from its package name ("Fiestarommet + Lek" → "Fiestarommet").
function roomOf(booking) {
  return booking.name.match(/\p{L}+rommet|Spiseområdet/iu)?.[0] ?? 'Annet';
}

function dayTitle(date) {
  const d = parseDate(date);
  const today = toDateString(new Date());
  const relative = date === today ? 'I dag · ' : date === addDays(today, 1) ? 'I morgen · ' : '';
  return `${relative}${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}

// One day: header with count and guests, then its bookings.
function DaySection({ day }) {
  const { date, bookings } = day;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{dayTitle(date)}</Text>
        <Text style={styles.sectionMeta}>
          {bookings.length} {bookings.length === 1 ? 'booking' : 'bookinger'} · {guestsOf(bookings)} gjester
        </Text>
      </View>
      {bookings.map((b) => (
        <BookingRow key={b.bookingNumber} booking={b} date={date} />
      ))}
    </View>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress} accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// Upcoming FunButler bookings: 10 days with bookings at a time from a chosen start date, with a room filter.
export default function BookingerScreen() {
  const today = toDateString(new Date());
  const [from, setFrom] = useState(today);
  const [room, setRoom] = useState(null); // null = all rooms
  const [result, setResult] = useState(null); // { from, days, noMore }
  const [error, setError] = useState(null);
  const { refreshing, refreshKey, refreshAll, finishRefresh } = useRefresh();
  const { location } = useLocation();
  const [loadingMore, setLoadingMore] = useState(false);
  const latestFrom = useRef(from);
  const shownCount = useRef(PAGE_SIZE);

  // Loads from the start date again, as many days as are shown (so the auto-refresh keeps "Vis flere" pages).
  const load = useCallback(async (forFrom, fresh) => {
    latestFrom.current = forFrom;
    const count = Math.min(MAX_PAGE, shownCount.current);
    try {
      const { days } = await fetchUpcomingBookings(forFrom, fresh, count, (saved) => {
        if (latestFrom.current !== forFrom) return;
        setResult((r) =>
          r?.from === forFrom && r.location === location.id
            ? r
            : { from: forFrom, location: location.id, days: saved.days, noMore: saved.days.length < count },
        );
      });
      if (latestFrom.current !== forFrom) return;
      setError(null);
      setResult({ from: forFrom, location: location.id, days, noMore: days.length < count });
    } catch (err) {
      if (latestFrom.current === forFrom) setError(err.message);
    } finally {
      finishRefresh();
    }
    // location.id: a new load function per location, so the effect reloads when the location changes.
  }, [finishRefresh, location.id]);

  useEffect(() => {
    shownCount.current = PAGE_SIZE;
    load(from);
    const timer = setInterval(() => load(from), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [from, load]);

  // Next 10 days with bookings after the last one shown.
  const loadMore = async () => {
    const last = result.days[result.days.length - 1];
    setLoadingMore(true);
    try {
      const { days } = await fetchUpcomingBookings(addDays(last.date, 1), false, PAGE_SIZE);
      if (latestFrom.current !== result.from) return;
      shownCount.current += PAGE_SIZE;
      setResult((r) => ({ ...r, days: [...r.days, ...days], noMore: days.length < PAGE_SIZE }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  // A global reload (top bar button or pull to refresh): new data straight from FunButler.
  const seenRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (seenRefreshKey.current === refreshKey) return;
    seenRefreshKey.current = refreshKey;
    load(from, true);
  }, [refreshKey, from, load]);
  const onRefresh = refreshAll;

  const current = result?.from === from && result.location === location.id ? result : null;
  const rooms = [...new Set(current?.days.flatMap((d) => d.bookings.map(roomOf)) ?? [])].sort();
  // Apply the room filter; days left without bookings are hidden.
  const days =
    current?.days
      .map((d) => ({ ...d, bookings: room ? d.bookings.filter((b) => roomOf(b) === room) : d.bookings }))
      .filter((d) => d.bookings.length > 0) ?? null;
  const all = days?.flatMap((d) => d.bookings) ?? [];

  return (
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <PageHeader
          title="Bookinger"
          subtitle={
            days ? `${days.length} dager · ${all.length} ${all.length === 1 ? 'booking' : 'bookinger'} · ${guestsOf(all)} gjester` : null
          }
          icon="calendar-outline"
          accent={colors.funbutler}
        >
          <DateFilter date={from} onChange={(d) => (setFrom(d), setRoom(null))} />
        </PageHeader>

        {/* Filters: start date, then one chip per room found in the loaded bookings. */}

        {rooms.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="Alle" active={!room} onPress={() => setRoom(null)} />
            {rooms.map((r) => (
              <Chip key={r} label={r} active={room === r} onPress={() => setRoom(room === r ? null : r)} />
            ))}
          </ScrollView>
        ) : null}

        {error && !current ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Kunne ikke hente bookinger fra FunButler</Text>
            <Text style={styles.muted}>{error}</Text>
            <Text style={styles.muted}>Prøvde: {API_URL}</Text>
          </View>
        ) : !days ? (
          // Day cards with booking rows, so the page doesn't jump when data arrives.
          <>
            <SkeletonCard tiles={[100, 100]} />
            <SkeletonCard tiles={[100]} />
            <SkeletonCard tiles={[100]} />
          </>
        ) : (
          <>
            {days.length === 0 ? (
              <View style={styles.section}>
                <Text style={styles.muted}>
                  {room ? `Ingen bookinger for ${room} i dagene som er lastet` : 'Ingen bookinger de neste 90 dagene'}
                </Text>
              </View>
            ) : (
              days.map((day) => <DaySection key={day.date} day={day} />)
            )}

            {current.noMore ? (
              <Text style={styles.endText}>Ingen flere bookinger de neste 90 dagene</Text>
            ) : (
              <Pressable
                style={[styles.moreButton, loadingMore && styles.moreButtonBusy]}
                onPress={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? <ActivityIndicator color="#fff" /> : <Text style={styles.moreText}>Vis flere</Text>}
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, minHeight: 0, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 14, padding: 14 },
  errorTitle: { fontFamily: fonts.semibold, fontSize: 16, color: '#b91c1c' },
  section: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 10, ...cardShadow },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  sectionMeta: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  chips: { gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.funbutler, borderColor: colors.funbutler },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  chipTextActive: { color: '#fff' },
  moreButton: {
    alignSelf: 'center',
    minWidth: 180,
    alignItems: 'center',
    backgroundColor: colors.funbutler,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  moreButtonBusy: { opacity: 0.7 },
  moreText: { fontFamily: fonts.semibold, color: '#fff' },
  endText: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4 },
});
