import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchBookings, fetchDashboard, fetchNextBookingDay } from '../api';
import { accentShadow, cardShadow, colors, fonts } from '../theme';
import { addDays, DAYS, formatNumber, MONTHS, parseDate, toDateString } from '../format';
import DateFilter from './DateFilter';
import PageHeader from './PageHeader';
import StaffSection from './StaffSection';
import WeatherWidget from './WeatherWidget';
import BookingModal from './BookingModal';
import Ionicons from '@expo/vector-icons/Ionicons';
import { logos } from '../logos';
import { LOCATIONS, useLocation } from '../location';
import { useRefresh } from '../refresh';
import { SkeletonCard, SkeletonRows } from './Skeleton';

const REFRESH_INTERVAL_MS = 60_000;

function formatTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function StatCard({ title, value, unit, style, children }) {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardValue}>
        {value}
        {unit ? <Text style={styles.cardUnit}> {unit}</Text> : null}
      </Text>
      {children}
    </View>
  );
}

// Highlighted total for both locations, with a small subtle tile per location.
function TotalCard({ title, total, parts }) {
  return (
    <View style={styles.totalCard}>
      <Text style={styles.totalTitle}>{title}</Text>
      <Text style={styles.totalValue}>
        {formatNumber(total, 2)}
        <Text style={styles.totalUnit}> kr</Text>
      </Text>
      <View style={styles.row}>
        {parts.map((part) => (
          <View key={part.label} style={styles.totalPart}>
            <Text style={styles.totalPartLabel}>{part.label}</Text>
            <Text style={styles.totalPartValue}>{part.value != null ? `${formatNumber(part.value, 2)} kr` : '–'}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// One of the main sections: an outer card with the service's logo and name, and its own tiles inside.
function Section({ logo, title, action, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Image source={logo} style={styles.sectionLogo} accessibilityIgnoresInvertColors />
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function SectionError({ text }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorTitle}>{text}</Text>
    </View>
  );
}

// Mirrors a row in FunButler's check-in list: time, birthday children ("David 5 år"), package, guests.
// Tapping it opens the booking's details (order lines, total, payment) in a modal.
export function BookingRow({ booking, date }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.card, styles.bookingRow, pressed && styles.bookingRowPressed]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityHint="Viser detaljer for bookingen"
      >
        <View style={styles.bookingTime}>
          <Text style={styles.bookingStart}>{booking.time}</Text>
          <Text style={styles.muted}>{booking.endTime}</Text>
        </View>
        <View style={styles.bookingInfo}>
          {booking.birthdayChildren.length > 0 ? (
            booking.birthdayChildren.map((child, i) => (
              <Text key={i} style={styles.bookingName}>
                {child.name}
                {child.age != null ? ` ${child.age} år` : ''}
              </Text>
            ))
          ) : (
            <Text style={styles.bookingName}>Booking</Text>
          )}
          <Text style={styles.detail}>{booking.name}</Text>
          <Text style={styles.muted}>
            #{booking.bookingNumber}
            {booking.price != null ? ` · ${formatNumber(booking.price)} kr` : ''}
          </Text>
        </View>
        <View style={styles.bookingGuests}>
          <Text style={styles.bookingGuestCount}>{booking.guests}</Text>
          <Text style={styles.muted}>gjester</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
      <BookingModal booking={open ? booking : null} date={date} onClose={() => setOpen(false)} />
    </>
  );
}

function dayDiff(a, b) {
  return Math.round((parseDate(a) - parseDate(b)) / 86_400_000);
}

// Bookings for a chosen day, with ‹ › buttons like FunButler's date bar.
function BookingsSection({ refreshKey, locationId }) {
  const today = toDateString(new Date());
  const [date, setDate] = useState(today);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const latestDate = useRef(date);
  // Result of "go to next day with booking" for the day it was pressed on: { date, state: 'searching' | 'none' | 'error' }.
  const [next, setNext] = useState(null);
  const nextState = next?.date === date ? next.state : null;

  // Jump to the first day after the selected one that has bookings.
  const goToNextBookingDay = async () => {
    setNext({ date, state: 'searching' });
    try {
      const { date: nextDate } = await fetchNextBookingDay(addDays(date, 1), locationId);
      if (nextDate) {
        setNext(null);
        setDate(nextDate);
      } else {
        setNext({ date, state: 'none' });
      }
    } catch {
      setNext({ date, state: 'error' });
    }
  };

  const load = useCallback(async (forDate, fresh) => {
    latestDate.current = forDate;
    setLoading(true);
    try {
      const data = await fetchBookings(
        forDate,
        fresh,
        (saved) => {
          if (latestDate.current === forDate) setResult((r) => (r?.date === forDate ? r : saved));
        },
        locationId,
      );
      // Ignore slow responses for a date the user has already moved away from.
      if (latestDate.current !== forDate) return;
      setResult(data);
      setError(null);
    } catch (err) {
      if (latestDate.current === forDate) setError(err.message);
    } finally {
      if (latestDate.current === forDate) setLoading(false);
    }
  }, [locationId]);

  // A changed refreshKey means the user pressed refresh: skip the backend cache for that load.
  const seenRefreshKey = useRef(refreshKey);
  useEffect(() => {
    load(date, seenRefreshKey.current !== refreshKey);
    seenRefreshKey.current = refreshKey;
    const timer = setInterval(() => load(date), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [date, refreshKey, load]);

  const d = parseDate(date);
  const diff = dayDiff(date, today);
  const relative = diff === 0 ? 'I dag' : diff === 1 ? 'I morgen' : diff === -1 ? 'I går' : String(d.getFullYear());
  const bookings = result?.date === date ? result.bookings : null;
  const guests = bookings?.reduce((sum, b) => sum + b.guests, 0) ?? 0;

  return (
    <Section
      logo={logos.funbutler}
      title="FunButler"
      action={
        diff !== 0 ? (
          <Pressable style={styles.todayButton} onPress={() => setDate(today)} hitSlop={8}>
            <Text style={styles.todayButtonText}>Gå til i dag</Text>
          </Pressable>
        ) : null
      }
    >

      <View style={[styles.card, styles.dateBar]}>
        <Pressable style={styles.dateArrow} onPress={() => setDate(addDays(date, -1))} hitSlop={8}>
          <Text style={styles.dateArrowText}>‹</Text>
        </Pressable>
        <View style={styles.dateLabel}>
          <Text style={styles.muted}>{relative}</Text>
          <Text style={styles.dateText}>
            {DAYS[d.getDay()]} {String(d.getDate()).padStart(2, '0')} {MONTHS[d.getMonth()]}
          </Text>
        </View>
        <Pressable style={styles.dateArrow} onPress={() => setDate(addDays(date, 1))} hitSlop={8}>
          <Text style={styles.dateArrowText}>›</Text>
        </Pressable>
      </View>
      {error && !bookings ? (
        <SectionError text="Kunne ikke hente bookinger fra FunButler" />
      ) : !bookings ? (
        <SkeletonRows count={2} height={76} />
      ) : bookings.length === 0 ? (
        <View style={[styles.card, styles.emptyCard]}>
          <Text style={styles.muted}>Ingen bookinger denne dagen</Text>
          <Pressable
            style={[styles.nextButton, nextState === 'searching' && styles.nextButtonBusy]}
            onPress={goToNextBookingDay}
            disabled={nextState === 'searching'}
          >
            {nextState === 'searching' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.nextButtonText}>Gå til neste dag med booking ›</Text>
            )}
          </Pressable>
          {nextState === 'none' ? <Text style={styles.muted}>Ingen bookinger de neste 90 dagene</Text> : null}
          {nextState === 'error' ? <Text style={styles.errorText}>Kunne ikke søke etter neste booking</Text> : null}
        </View>
      ) : (
        <>
          <Text style={styles.muted}>
            {bookings.length} {bookings.length === 1 ? 'booking' : 'bookinger'} · {guests} gjester
            {loading ? ' · oppdaterer …' : ''}
          </Text>
          {bookings.map((b) => (
            <BookingRow key={b.bookingNumber} booking={b} date={date} />
          ))}
        </>
      )}
    </Section>
  );
}

// Oversikt for one location (a page in the pager below).
function OversiktPage({ locationId }) {
  const today = toDateString(new Date());
  // The date filter only drives the two sales sections; FunButler has its own day bar.
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // Global reload (top bar button or pull to refresh): sections get the same refreshKey.
  const { refreshing, refreshKey, refreshAll, finishRefresh } = useRefresh();
  const latestDate = useRef(date);

  const load = useCallback(async (forDate, fresh) => {
    latestDate.current = forDate;
    try {
      const result = await fetchDashboard(
        forDate,
        fresh,
        (saved) => {
          if (latestDate.current === forDate) setData((d) => (d?.date === forDate ? d : saved));
        },
        locationId,
      );
      // Ignore slow responses for a date the user has already moved away from.
      if (latestDate.current !== forDate) return;
      setError(null);
      setData(result);
    } catch (err) {
      if (latestDate.current === forDate) setError(err.message);
    } finally {
      finishRefresh();
    }
  }, [finishRefresh, locationId]);

  // Load now, then refresh every minute (the backend caches for 60 s anyway).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data loading; the saved answer is shown at once
    load(date);
    // Fetch the day before and after in the background (saved on the device), so ‹ › show data instantly.
    for (const day of [addDays(date, -1), addDays(date, 1)]) {
      if (day <= today) fetchDashboard(day, false, () => {}, locationId).catch(() => {});
    }
    const timer = setInterval(() => load(date), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [date, load, today, locationId]);

  // A global reload: new data straight from the sites (the sections react to refreshKey themselves).
  const seenRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (seenRefreshKey.current === refreshKey) return;
    seenRefreshKey.current = refreshKey;
    load(date, true);
  }, [refreshKey, date, load]);
  const onRefresh = refreshAll;


  const isToday = date === today;
  const current = data?.date === date ? data : null;
  const sales = current?.serviceA;
  const nordpay = current?.serviceB;
  const change = sales?.revenueChangePercent;
  const totalSales =
    sales?.revenueToday != null || nordpay?.salesToday != null
      ? (sales?.revenueToday ?? 0) + (nordpay?.salesToday ?? 0)
      : null;

  return (
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <PageHeader
          title={isToday ? 'I dag' : 'Oversikt'}
          subtitle={current?.updatedAt ? `Oppdatert ${formatTime(current.updatedAt)} · hvert minutt` : null}
          live={isToday}
          icon="time-outline"
        >
          <DateFilter date={date} onChange={setDate} max={today} />
        </PageHeader>



        {error && !current ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Får ikke kontakt med serveren</Text>
            <Text style={styles.muted}>{error}</Text>
          </View>
        ) : !current ? (
          // Same shapes as the total card and the two sales sections, so the page doesn't jump when data arrives.
          <>
            <SkeletonCard accent height={190} />
            <SkeletonCard tiles={[150, 110, 110]} />
            <SkeletonCard tiles={[110]} />
          </>
        ) : (
          <>
            {totalSales != null ? (
              <TotalCard
                title={isToday ? 'Totalt salg i dag' : 'Totalt salg'}
                total={totalSales}
                parts={[
                  { label: 'Extanda Go', value: sales?.revenueToday },
                  { label: 'NordPay', value: nordpay?.salesToday },
                ]}
              />
            ) : null}

            <Section logo={logos.extandaGo} title="Extanda Go">
              {sales ? (
                <>
                  <StatCard title={isToday ? 'Dagens omsetning' : 'Omsetning'} value={formatNumber(sales.revenueToday, 2)} unit="kr">
                    <Text style={styles.detail}>
                      Samme ukedag i fjor: {formatNumber(sales.revenueLastYearSameWeekday, 2)} kr
                    </Text>
                    {change != null ? (
                      <Text style={[styles.detail, change < 0 ? styles.negative : styles.positive]}>
                        {change > 0 ? '+' : ''}
                        {formatNumber(change, 1)} % mot i fjor
                      </Text>
                    ) : null}
                  </StatCard>
                  <View style={styles.row}>
                    <StatCard style={styles.half} title="Produkter solgt" value={formatNumber(sales.productsSoldToday)} />
                    <StatCard style={styles.half} title="Kunder" value={formatNumber(sales.customersToday)} />
                  </View>
                  <StatCard title="Bruttomargin" value={formatNumber(sales.grossMarginPercent)} unit="%" />
                </>
              ) : (
                <SectionError text="Kunne ikke hente tall fra Extanda Go" />
              )}
            </Section>

            <Section logo={logos.nordpay} title="NordPay">
              {nordpay ? (
                <View style={styles.row}>
                  <StatCard style={styles.half} title={isToday ? 'Dagens salg' : 'Salg'} value={formatNumber(nordpay.salesToday)} unit="kr" />
                  <StatCard style={styles.half} title="Bestillinger" value={formatNumber(nordpay.ordersToday)} />
                </View>
              ) : (
                <SectionError text="Kunne ikke hente tall fra NordPay" />
              )}
            </Section>
          </>
        )}

        <BookingsSection refreshKey={refreshKey} locationId={locationId} />

        <WeatherWidget refreshKey={refreshKey} locationId={locationId} />

        <StaffSection refreshKey={refreshKey} locationId={locationId} />
      </ScrollView>
    </View>
  );
}

// Oversikt: one page per location side by side. Swiping uses the platform's own scrolling with page snapping
// (smooth, follows the finger) and changes the global location; choosing in the picker scrolls to that page.
// All pages stay loaded, so the next location's numbers are already there when you swipe.
export default function DashboardScreen() {
  const { location, setLocationId } = useLocation();
  const locations = LOCATIONS.filter((l) => l.available);
  const index = Math.max(0, locations.findIndex((l) => l.id === location.id));
  const [size, setSize] = useState(null);
  const pager = useRef(null);
  const settleTimer = useRef(null);

  // Follow the picker (and the first layout): show the chosen location's page.
  useEffect(() => {
    if (size) pager.current?.scrollTo({ x: index * size.width, animated: true });
  }, [index, size]);

  // When scrolling has settled on a page, make that the global location.
  const onScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const page = locations[Math.round(x / size.width)];
      if (page && page.id !== location.id) setLocationId(page.id);
    }, 120);
  };

  return (
    <View style={styles.safe} onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {size ? (
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={onScroll}
          contentOffset={{ x: index * size.width, y: 0 }}
        >
          {locations.map((l) => (
            <View key={l.id} style={{ width: size.width, height: size.height }}>
              <OversiktPage locationId={l.id} />
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, minHeight: 0, backgroundColor: '#f2f4f7' },
  // maxWidth keeps the dashboard readable on wide desktop screens
  content: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  totalCard: {
    backgroundColor: '#2563eb',
    borderRadius: 20,
    padding: 20,
    gap: 4,
    ...accentShadow,
  },
  totalTitle: { fontFamily: fonts.bold, fontSize: 13, color: '#bfdbfe', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalValue: { fontFamily: fonts.semibold, fontSize: 44, color: '#fff', marginBottom: 12 },
  totalUnit: { fontFamily: fonts.regular, fontSize: 20, color: '#bfdbfe' },
  totalPart: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  totalPartLabel: { fontFamily: fonts.medium, fontSize: 12, color: '#2563eb' },
  totalPartValue: { fontFamily: fonts.semibold, fontSize: 16, color: '#111827', marginTop: 2 },
  // Outer card for each main section
  section: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    gap: 10,
    marginTop: 4,
    ...cardShadow,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  sectionLogo: { width: 28, height: 28 },
  sectionTitle: { fontFamily: fonts.heading, flex: 1, fontSize: 18, color: '#111827' },
  dateBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  dateArrow: { paddingHorizontal: 16, paddingVertical: 4 },
  dateArrowText: { fontFamily: fonts.regular, fontSize: 36, color: '#111827', lineHeight: 40 },
  dateLabel: { flex: 1, alignItems: 'center' },
  dateText: { fontFamily: fonts.semibold, fontSize: 20, color: '#111827' },
  todayButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#dbeafe' },
  todayButtonText: { fontFamily: fonts.semibold, color: '#1e40af' },
  emptyCard: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  nextButton: { backgroundColor: '#2563eb', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, minWidth: 220, alignItems: 'center' },
  nextButtonBusy: { opacity: 0.7 },
  nextButtonText: { fontFamily: fonts.semibold, color: '#fff' },
  errorText: { fontFamily: fonts.regular, fontSize: 13, color: '#b91c1c' },
  bookingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bookingRowPressed: { backgroundColor: '#eceef2' },
  bookingTime: { alignItems: 'center', minWidth: 48 },
  bookingStart: { fontFamily: fonts.semibold, fontSize: 18, color: '#111827' },
  bookingInfo: { flex: 1 },
  bookingName: { fontFamily: fonts.semibold, fontSize: 15, color: '#111827' },
  bookingGuests: { alignItems: 'center' },
  bookingGuestCount: { fontFamily: fonts.semibold, fontSize: 22, color: colors.funbutler },
  // Tile inside a section
  card: { backgroundColor: '#f6f7f9', borderRadius: 14, padding: 14 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 13, color: '#6b7280', textTransform: 'uppercase' },
  cardValue: { fontFamily: fonts.light, fontSize: 36, color: '#111827', marginTop: 6 },
  cardUnit: { fontFamily: fonts.regular, fontSize: 18, color: '#6b7280' },
  detail: { fontFamily: fonts.regular, fontSize: 14, color: '#374151', marginTop: 6 },
  positive: { color: '#15803d' },
  negative: { color: '#b91c1c' },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: '#6b7280', marginTop: 4 },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 14, padding: 14 },
  errorTitle: { fontFamily: fonts.semibold, fontSize: 16, color: '#b91c1c' },
});
