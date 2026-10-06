import { Image, StyleSheet, Text, View } from 'react-native';
import { cardShadow, colors, fonts } from '../theme';
import { formatNumber } from '../format';
import { logos } from '../logos';

// Extanda Go employees ranked by sales for the day, with a bar relative to the best seller.
export default function TopSellersCard({ sellers }) {
  const best = sellers[0]?.revenue || 1;
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Image source={logos.extandaGo} style={styles.logo} />
        <Text style={styles.title}>Mestselgende ansatte</Text>
      </View>
      {sellers.length === 0 ? (
        <Text style={styles.muted}>Ingen salg registrert denne dagen</Text>
      ) : (
        sellers.map((seller, i) => (
          <View key={seller.name + i} style={styles.row}>
            <View style={[styles.rank, i === 0 && styles.rankFirst]}>
              <Text style={[styles.rankText, i === 0 && styles.rankTextFirst]}>{i + 1}</Text>
            </View>
            <View style={styles.info}>
              <View style={styles.line}>
                <Text style={styles.name} numberOfLines={1}>
                  {seller.name}
                </Text>
                <Text style={styles.amount}>{formatNumber(seller.revenue)} kr</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.bar, { width: `${Math.max(4, (seller.revenue / best) * 100)}%` }]} />
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 12, ...cardShadow },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 24, height: 24 },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  rankFirst: { backgroundColor: '#fde68a' },
  rankText: { fontFamily: fonts.bold, fontSize: 12, color: '#374151' },
  rankTextFirst: { color: '#92400e' },
  info: { flex: 1, gap: 5 },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  amount: { fontFamily: fonts.medium, fontSize: 14, color: '#374151' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
});
