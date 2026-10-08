import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import PageHeader from './PageHeader';
import WeatherWidget, { WeekForecast } from './WeatherWidget';
import { useLocation } from '../location';
import { useRefresh } from '../refresh';

// The weather card from Oversikt on its own page, for the chosen location.
export default function VaerScreen() {
  const { location } = useLocation();
  const { refreshing, refreshKey, refreshAll } = useRefresh();
  return (
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
      >
        <PageHeader title="Været" subtitle={location.place} icon="partly-sunny-outline" />
        <WeatherWidget refreshKey={refreshKey} locationId={location.id} />
        <WeekForecast refreshKey={refreshKey} locationId={location.id} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, minHeight: 0, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
});
