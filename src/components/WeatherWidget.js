import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchWeather } from '../api';
import { cardShadow, colors, fonts } from '../theme';
import { toDateString } from '../format';
import DateFilter from './DateFilter';
import { logos } from '../logos';
import { LOCATIONS } from '../location';
import { SkeletonBlock } from './Skeleton';

const REFRESH_INTERVAL_MS = 10 * 60_000;

// MET symbol code ("partlycloudy_night", "lightrainshowers_day", …) → Norwegian label.
function describe(symbol) {
  const base = symbol.replace(/_(day|night|polartwilight)$/, '');
  if (base.includes('thunder')) return 'Torden';
  if (base.includes('snow')) return 'Snø';
  if (base.includes('sleet')) return 'Sludd';
  if (base.includes('rain')) return base.startsWith('light') ? 'Lett regn' : base.startsWith('heavy') ? 'Kraftig regn' : 'Regn';
  if (base === 'clearsky') return 'Klarvær';
  if (base === 'fair') return 'Lettskyet';
  if (base === 'partlycloudy') return 'Delvis skyet';
  if (base === 'fog') return 'Tåke';
  return 'Skyet';
}

// yr.no's own colour icons, one per MET symbol code (MIT licence, github.com/metno/weathericons).
function WeatherIcon({ symbol, size }) {
  return (
    <Image
      source={{ uri: `https://cdn.jsdelivr.net/gh/metno/weathericons@main/weather/png/${symbol}.png` }}
      style={{ width: size, height: size }}
      accessibilityLabel={describe(symbol)}
    />
  );
}

const pad = (n) => String(n).padStart(2, '0');
const dayOf = (iso) => toDateString(new Date(iso));
// "14" for an hourly step, "12–18" for a 6-hour step.
function stepLabel(step) {
  const h = new Date(step.time).getHours();
  return step.period === 6 ? `${pad(h)}–${pad((h + 6) % 24)}` : pad(h);
}
const temp = (t) => `${Math.round(t)}°`;

// Weather at Playworld Sørlandet. Today: now + the next 12 hours. Other days (up to MET's ~9-day
// forecast): midday weather, high/low, and that day's steps.
export default function WeatherWidget({ refreshKey, locationId }) {
  const location = LOCATIONS.find((l) => l.id === locationId) ?? LOCATIONS[0];
  const today = toDateString(new Date());
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const load = () =>
      fetchWeather((saved) => setData((d) => d ?? saved), locationId)
        .then((d) => (setData(d), setFailed(false)))
        .catch(() => setFailed(true));
    load();
    const timer = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshKey, locationId]);

  const steps = data ? [data.now, ...data.hours] : [];
  const lastDay = steps.length ? dayOf(steps[steps.length - 1].time) : today;
  const daySteps = steps.filter((st) => dayOf(st.time) === date);
  const isToday = date === today;
  // Headline: right now for today, otherwise the step closest to 12:00.
  const headline = isToday
    ? data?.now
    : daySteps.reduce(
        (best, st) =>
          !best || Math.abs(new Date(st.time).getHours() - 12) < Math.abs(new Date(best.time).getHours() - 12) ? st : best,
        null,
      );
  const strip = isToday ? (data?.hours.slice(0, 12) ?? []) : daySteps;
  const temps = daySteps.map((st) => st.temperature);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Image source={logos.yr} style={styles.logo} accessibilityLabel="yr" />
        <Text style={styles.title}>Været på {location.place}</Text>
      </View>

      {data ? <DateFilter date={date} onChange={setDate} min={today} max={lastDay} inset /> : null}

      {!data && failed ? (
        <Text style={styles.error}>Kunne ikke hente været</Text>
      ) : !data ? (
        // Date bar, headline and the hour strip.
        <>
          <SkeletonBlock height={62} radius={14} />
          <SkeletonBlock height={60} width="70%" radius={14} />
          <SkeletonBlock height={104} radius={14} />
        </>
      ) : !headline ? (
        <Text style={styles.muted}>Ingen værmelding for denne dagen</Text>
      ) : (
        <>
          <View style={styles.now}>
            <WeatherIcon symbol={headline.symbol} size={56} />
            <Text style={styles.nowTemp}>{temp(headline.temperature)}</Text>
            <View style={styles.nowInfo}>
              <Text style={styles.nowLabel}>{describe(headline.symbol)}</Text>
              <Text style={styles.muted}>
                Vind {Math.round(headline.windSpeed)} m/s
                {headline.precipitation > 0 ? ` · ${headline.precipitation} mm` : ''}
              </Text>
              {!isToday && temps.length ? (
                <Text style={styles.muted}>
                  Høy {temp(Math.max(...temps))} · Lav {temp(Math.min(...temps))}
                </Text>
              ) : null}
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hours}>
            {strip.map((h) => (
              <View key={h.time} style={[styles.hour, h.period === 6 && styles.hourWide]}>
                <Text style={styles.hourTime}>{stepLabel(h)}</Text>
                <WeatherIcon symbol={h.symbol} size={28} />
                <Text style={styles.hourTemp}>{temp(h.temperature)}</Text>
                <Text style={styles.hourRain}>{h.precipitation > 0 ? `${h.precipitation} mm` : ' '}</Text>
              </View>
            ))}
          </ScrollView>

          {/* MET Norway's licence (CC BY 4.0) requires crediting the source. */}
          <Text style={styles.credit}>Værdata fra MET Norway (yr.no)</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    marginTop: 4,
    ...cardShadow,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 24, height: 24 },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  now: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nowTemp: { fontFamily: fonts.light, fontSize: 44, color: colors.text },
  nowInfo: { flex: 1 },
  nowLabel: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  error: { fontFamily: fonts.regular, fontSize: 13, color: '#b91c1c' },
  hours: { gap: 8 },
  hour: { alignItems: 'center', gap: 4, backgroundColor: '#f6f7f9', borderRadius: 12, paddingVertical: 10, width: 56 },
  hourWide: { width: 72 },
  hourTime: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  hourTemp: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  hourRain: { fontFamily: fonts.regular, fontSize: 10, color: colors.accent },
  credit: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
});
