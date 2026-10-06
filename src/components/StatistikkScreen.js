import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { API_URL, fetchHourlySales } from '../api';
import { accentShadow, cardShadow, colors, fonts } from '../theme';
import { addDays, formatNumber, toDateString } from '../format';
import DateFilter from './DateFilter';
import PageHeader from './PageHeader';
import TopSellersCard from './TopSellersCard';
import { SkeletonCard } from './Skeleton';

const REFRESH_INTERVAL_MS = 60_000;
const CHART_HEIGHT = 200;

// One color per location, used for the bars and the legend (validated for colorblind separation).
const SERIES = [
  { key: 'extandaGo', label: 'Extanda Go', color: '#2563eb' },
  { key: 'nordpay', label: 'NordPay', color: '#eb6834' },
];

const hourTotal = (h) => (h.extandaGo ?? 0) + (h.nordpay ?? 0);
const hourLabel = (hour) => `${String(hour).padStart(2, '0')}–${String(hour + 1).padStart(2, '0')}`;

// Gridlines every 500 kr; every 1000 kr on busy days so the labels don't crowd.
function axisSteps(maxValue) {
  const step = maxValue > 5000 ? 1000 : 500;
  const max = Math.max(step, Math.ceil(maxValue / step) * step);
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, i) => i * step) };
}

// Stacked bar per hour with its total written above it.
function HourlyChart({ hours, currentHour }) {
  const { max, ticks } = axisSteps(Math.max(...hours.map(hourTotal)));

  return (
    <View style={styles.chartCard}>
      <View style={styles.legend}>
        {SERIES.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>{s.label}</Text>
            <Text style={styles.legendValue}>{formatNumber(hours.reduce((sum, h) => sum + (h[s.key] ?? 0), 0))} kr</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <Text style={styles.legendText}>Totalt</Text>
          <Text style={styles.legendValue}>{formatNumber(hours.reduce((sum, h) => sum + hourTotal(h), 0))} kr</Text>
        </View>
      </View>

      <View style={styles.plot}>
        {/* Recessive gridlines with their values on the left. */}
        {ticks.map((tick) => (
          <View key={tick} style={[styles.gridLine, { bottom: (tick / max) * CHART_HEIGHT }]}>
            {tick > 0 ? <Text style={styles.gridLabel}>{formatNumber(tick)}</Text> : null}
          </View>
        ))}

        <View style={styles.bars}>
          {hours.map((h) => (
            <View
              key={h.hour}
              style={styles.column}
              accessible
              accessibilityLabel={`Klokken ${hourLabel(h.hour)}: ${formatNumber(hourTotal(h))} kroner`}
            >
              {hourTotal(h) > 0 ? <Text style={styles.barValue}>{formatNumber(hourTotal(h))}</Text> : null}
              <View style={styles.stack}>
                {/* Top segment first: column-reverse would also work but RN web handles gaps oddly with it. */}
                {[...SERIES].reverse().map((s, i, arr) => {
                  const value = h[s.key] ?? 0;
                  if (value <= 0) return null;
                  const isTop = arr.slice(0, i).every((t) => (h[t.key] ?? 0) <= 0);
                  return (
                    <View
                      key={s.key}
                      style={[
                        styles.segment,
                        { height: (value / max) * CHART_HEIGHT, backgroundColor: s.color },
                        isTop && styles.segmentTop,
                      ]}
                    />
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.xAxis}>
        {hours.map((h) => (
          <Text key={h.hour} style={[styles.xLabel, h.hour === currentHour && styles.xLabelNow]}>
            {String(h.hour).padStart(2, '0')}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function StatistikkScreen() {
  const today = toDateString(new Date());
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const latestDate = useRef(date);

  const load = useCallback(async (forDate, fresh) => {
    latestDate.current = forDate;
    try {
      const result = await fetchHourlySales(forDate, fresh, (saved) => {
        if (latestDate.current === forDate) setData((d) => (d?.date === forDate ? d : saved));
      });
      // Ignore slow responses for a date the user has already moved away from.
      if (latestDate.current !== forDate) return;
      setError(null);
      setData(result);
    } catch (err) {
      if (latestDate.current === forDate) setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(date);
    // Fetch the day before and after in the background (saved on the device), so ‹ › show data instantly.
    for (const day of [addDays(date, -1), addDays(date, 1)]) {
      if (day <= today) fetchHourlySales(day, false, () => {}).catch(() => {});
    }
    const timer = setInterval(() => load(date), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [date, load, today]);

  // Refresh button / pull to refresh: new data straight from the sites.
  const onRefresh = () => {
    setRefreshing(true);
    load(date, true);
  };

  const isToday = date === today;
  const current = data?.date === date ? data : null;
  const hours = current?.hours ?? [];
  const total = hours.reduce((sum, h) => sum + hourTotal(h), 0);
  const best = hours.reduce((a, h) => (a == null || hourTotal(h) > hourTotal(a) ? h : a), null);
  const currentHour = isToday ? new Date().getHours() : null;
  const failed = SERIES.filter((s) => hours.length > 0 && hours[0][s.key] == null);

  return (
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <PageHeader
          title="Statistikk"
          subtitle={current ? `Salg per time · åpent ${current.openHour}–${current.closeHour}` : null}
          icon="time-outline"
          onRefresh={onRefresh}
          refreshing={refreshing}
        />

        <DateFilter date={date} onChange={setDate} max={today} />

        {error && !current ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Får ikke kontakt med serveren</Text>
            <Text style={styles.muted}>{error}</Text>
            <Text style={styles.muted}>Prøvde: {API_URL}</Text>
          </View>
        ) : !current ? (
          // Same shapes as the total card, chart and table, so the page doesn't jump when data arrives.
          <>
            <SkeletonCard accent height={130} />
            <SkeletonCard tiles={[260]} />
            <SkeletonCard tiles={[420]} />
          </>
        ) : (
          <>
            <View style={styles.totalCard}>
              <Text style={styles.totalTitle}>{isToday ? 'Totalt salg i dag' : 'Totalt salg'}</Text>
              <Text style={styles.totalValue}>
                {formatNumber(total, 2)}
                <Text style={styles.totalUnit}> kr</Text>
              </Text>
              {best && hourTotal(best) > 0 ? (
                <Text style={styles.totalNote}>
                  Beste time: kl. {hourLabel(best.hour)} · {formatNumber(hourTotal(best))} kr
                </Text>
              ) : null}
            </View>

            {failed.map((s) => (
              <View key={s.key} style={styles.errorBox}>
                <Text style={styles.errorTitle}>Kunne ikke hente timetall fra {s.label}</Text>
              </View>
            ))}

            <HourlyChart hours={hours} currentHour={currentHour} />

            {current.topSellers ? <TopSellersCard sellers={current.topSellers} /> : null}

            {/* The same numbers as a table, for exact values and screen readers. */}
            <View style={styles.tableCard}>
              <View style={[styles.tableRow, styles.tableHead]}>
                <Text style={[styles.cellHour, styles.headText]}>Time</Text>
                {SERIES.map((s) => (
                  <Text key={s.key} style={[styles.cell, styles.headText]}>{s.label}</Text>
                ))}
                <Text style={[styles.cell, styles.headText]}>Totalt</Text>
              </View>
              {hours.map((h) => (
                <View key={h.hour} style={styles.tableRow}>
                  <Text style={styles.cellHour}>{hourLabel(h.hour)}</Text>
                  {SERIES.map((s) => (
                    <Text key={s.key} style={styles.cell}>{formatNumber(h[s.key])}</Text>
                  ))}
                  <Text style={[styles.cell, styles.cellTotal]}>{formatNumber(hourTotal(h))}</Text>
                </View>
              ))}
              <View style={[styles.tableRow, styles.tableFoot]}>
                <Text style={[styles.cellHour, styles.cellTotal]}>Sum</Text>
                {SERIES.map((s) => (
                  <Text key={s.key} style={[styles.cell, styles.cellTotal]}>
                    {formatNumber(hours.reduce((sum, h) => sum + (h[s.key] ?? 0), 0))}
                  </Text>
                ))}
                <Text style={[styles.cell, styles.cellTotal]}>{formatNumber(total)}</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, minHeight: 0, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { alignItems: 'center', gap: 12, marginTop: 48 },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 4 },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 14, padding: 14 },
  errorTitle: { fontFamily: fonts.semibold, fontSize: 16, color: '#b91c1c' },

  totalCard: { backgroundColor: colors.accent, borderRadius: 20, padding: 20, gap: 4, ...accentShadow },
  totalTitle: { fontFamily: fonts.bold, fontSize: 13, color: '#bfdbfe', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalValue: { fontFamily: fonts.semibold, fontSize: 44, color: '#fff' },
  totalUnit: { fontFamily: fonts.regular, fontSize: 20, color: '#bfdbfe' },
  totalNote: { fontFamily: fonts.medium, fontSize: 14, color: '#dbeafe' },

  chartCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 10, ...cardShadow },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  legendValue: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  plot: { height: CHART_HEIGHT, marginTop: 20, marginLeft: 40 },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  gridLabel: { position: 'absolute', left: -40, width: 36, top: -8, textAlign: 'right', fontFamily: fonts.regular, fontSize: 10, color: colors.muted },
  bars: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  stack: { width: '62%', maxWidth: 28, gap: 2 },
  barValue: { fontFamily: fonts.semibold, fontSize: 10, color: colors.text, marginBottom: 3, textAlign: 'center' },
  segment: { width: '100%' },
  segmentTop: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  xAxis: { flexDirection: 'row', marginLeft: 40 },
  xLabel: { flex: 1, textAlign: 'center', fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
  xLabelNow: { fontFamily: fonts.bold, color: colors.text },

  tableCard: { backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, ...cardShadow },
  tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tableHead: { borderBottomColor: colors.muted },
  tableFoot: { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: colors.muted },
  headText: { fontFamily: fonts.semibold, color: colors.muted, fontSize: 12 },
  cellHour: { width: 64, fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  cell: { flex: 1, textAlign: 'right', fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  cellTotal: { fontFamily: fonts.semibold },
});
