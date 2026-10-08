import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fetchHealth, sendTestPush } from '../api';
import { cardShadow, colors, fonts } from '../theme';
import { logos } from '../logos';
import { canSelfUpdate, checkForUpdate, fromPlayStore, installedVersion, versionLabel } from '../updates';
import PageHeader from './PageHeader';
import UpdateDialog from './UpdateDialog';
import { useAuth } from '../auth';

// The services' own web pages (same URLs as in dashboard-backend/.env; logins stay in the backend).
const SOURCES = [
  { logo: logos.extandaGo, name: 'Extanda Go', detail: 'Kassesalg (Wallmob)', url: 'https://wbo-etail.wallmob.com' },
  { logo: logos.nordpay, name: 'NordPay', detail: 'Bestillinger og kiosk', url: 'https://admin.nordpay.no' },
  { logo: logos.funbutler, name: 'FunButler', detail: 'Bookinger og bursdager', url: 'https://booking.funbutler.com' },
  { logo: logos.planday, name: 'Planday', detail: 'Vaktplan', url: 'https://playworld.planday.com' },
  { logo: logos.yr, name: 'yr', detail: 'Værdata fra MET Norway', url: 'https://www.yr.no/nb/s%C3%B8k?q=Kristiansand' },
];

function Group({ title, children }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

// One settings row: icon or logo, label, optional detail under it, and a value or chevron on the right.
function Row({ icon, logo, label, detail, value, valueColor, onPress, last, busy, disabled }) {
  const content = (
    <>
      {logo ? (
        <Image source={logo} style={styles.rowLogo} />
      ) : (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={18} color={colors.accent} />
        </View>
      )}
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, disabled && styles.disabled]}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {busy ? <ActivityIndicator /> : value ? <Text style={[styles.rowValue, valueColor && { color: valueColor }]}>{value}</Text> : null}
      {onPress && !busy ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
    </>
  );
  const style = [styles.row, !last && styles.rowDivider];
  return onPress ? (
    <Pressable
      style={({ pressed }) => [...style, pressed && styles.rowPressed]}
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
    >
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

// One health check → { ok: true, ms } or { ok: false }.
async function timeHealthCheck() {
  const started = Date.now();
  try {
    await fetchHealth();
    return { ok: true, ms: Date.now() - started };
  } catch {
    return { ok: false };
  }
}

export default function SettingsScreen() {
  const installed = installedVersion();
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null); // text under "Se etter oppdateringer"
  const [update, setUpdate] = useState(null);
  const [health, setHealth] = useState(null); // { ok, ms }
  const { logout } = useAuth();
  const [pushState, setPushState] = useState(null); // null | 'sending' | text after sending

  const testPush = async () => {
    setPushState('sending');
    try {
      const { phones } = await sendTestPush();
      setPushState(`Sendt til ${phones} ${phones === 1 ? 'telefon' : 'telefoner'}`);
    } catch {
      setPushState('Kunne ikke sende testvarsel');
    }
  };

  // `health` starts as null (checking); pressing the Status row checks again.
  useEffect(() => {
    timeHealthCheck().then(setHealth);
  }, []);
  const pingServer = () => {
    setHealth(null);
    timeHealthCheck().then(setHealth);
  };

  const checkNow = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const result = await checkForUpdate({ force: true });
      if (result.updateAvailable) setUpdate(result);
      else setCheckResult(`Du har nyeste versjon (${versionLabel(result.installed.version, result.installed.versionCode)})`);
    } catch {
      setCheckResult('Fikk ikke kontakt med oppdateringsserveren');
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          title="Innstillinger"
          subtitle={installed.version ? `Versjon ${versionLabel(installed.version, installed.versionCode)}` : 'Playworld Dashboard'}
          icon="settings-outline"
        />

        <Group title="App">
          <Row
            icon="phone-portrait-outline"
            label="Versjon"
            value={versionLabel(installed.version, installed.versionCode)}
          />
          <Row
            icon="cloud-download-outline"
            label="Se etter oppdateringer"
            detail={
              canSelfUpdate
                ? (checkResult ?? 'Sjekkes også automatisk når appen åpnes')
                : fromPlayStore
                  ? 'Oppdateres automatisk via Google Play'
                  : 'Bare i Android-appen'
            }
            onPress={canSelfUpdate ? checkNow : undefined}
            busy={checking}
            disabled={!canSelfUpdate}
            last
          />
        </Group>

        <Group title="Tilkobling">
          {/* Connection state only; the server address is not shown in the app. */}
          <Row
            icon="server-outline"
            label="Server"
            value={!health ? null : health.ok ? 'Tilkoblet' : 'Frakoblet'}
            valueColor={health?.ok ? '#16a34a' : '#dc2626'}
          />
          <Row
            icon={health?.ok === false ? 'cloud-offline-outline' : 'pulse-outline'}
            label="Status"
            detail={
              !health ? 'Sjekker …' : health.ok ? `Tilkoblet · svarer på ${health.ms} ms` : 'Får ikke kontakt med serveren'
            }
            value={health ? '●' : null}
            valueColor={health?.ok ? '#16a34a' : '#dc2626'}
            onPress={pingServer}
            busy={!health}
            last
          />
        </Group>

        {Platform.OS !== 'web' ? (
          <Group title="Varsler">
            <Row
              icon="notifications-outline"
              label="Send testvarsel"
              detail={pushState && pushState !== 'sending' ? pushState : 'Sender et varsel til alle telefoner med appen'}
              onPress={testPush}
              busy={pushState === 'sending'}
              last
            />
          </Group>
        ) : null}

        <Group title="Konto">
          <Row
            icon="log-out-outline"
            label="Logg ut"
            detail="Innlogget"
            onPress={logout}
            last
          />
        </Group>

        <Group title="Datakilder">
          {SOURCES.map((s, i) => (
            <Row
              key={s.name}
              logo={s.logo}
              label={s.name}
              detail={s.detail}
              onPress={() => Linking.openURL(s.url)}
              last={i === SOURCES.length - 1}
            />
          ))}
        </Group>

        <Group title="Om">
          <Row icon="business-outline" label="Playworld Sørlandet" detail="Barstølveien 35, 4636 Kristiansand" />
          <Row icon="business-outline" label="Playworld Triaden" detail="Triaden Lørenskog Storsenter, Gamleveien 88, 1461 Rasta" />
          <Row icon="refresh-outline" label="Oppdatering av tall" detail="Automatisk hvert minutt, eller med oppdater-knappen" last />
        </Group>

        <Text style={styles.credit}>
          Dvnny |{' '}
          <Text style={styles.creditLink} onPress={() => Linking.openURL('https://dvnny.no')} accessibilityRole="link">
            dvnny.no
          </Text>
        </Text>
      </ScrollView>

      <UpdateDialog update={update} onClose={() => setUpdate(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, minHeight: 0, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48, gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center' },
  group: { gap: 8 },
  groupTitle: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  card: { backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, minHeight: 56 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowPressed: { opacity: 0.6 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLogo: { width: 34, height: 34 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  rowDetail: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  rowValue: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  disabled: { color: colors.muted },
  credit: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8 },
  creditLink: { fontFamily: fonts.semibold, color: colors.accent },
});
