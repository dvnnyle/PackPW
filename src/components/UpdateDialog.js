import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { cardShadow, colors, fonts } from '../theme';
import { downloadAndInstall, openInstallPermissionSettings, versionLabel } from '../updates';

// "Update available" / "Update required" dialog. Downloads the APK with a progress bar, then opens
// Android's installer. A mandatory update has no "Senere" button and can't be dismissed.
export default function UpdateDialog({ update, onClose }) {
  const [state, setState] = useState('idle'); // idle | downloading | installing | error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const mandatory = !!update?.mandatory;

  const start = async () => {
    setState('downloading');
    setProgress(0);
    setError(null);
    try {
      await downloadAndInstall(update, setProgress);
      // We're back from Android's installer. If it installed, the app restarts on the new version;
      // otherwise (cancelled or blocked) the user can try again or allow installs.
      setState('installing');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  };

  const close = () => {
    if (mandatory) return;
    setState('idle');
    onClose();
  };

  return (
    <Modal visible={!!update} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        {update ? (
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <Ionicons name="cloud-download-outline" size={28} color={colors.accent} />
            </View>
            <Text style={styles.title}>{mandatory ? 'Oppdatering kreves' : 'Ny oppdatering'}</Text>
            <Text style={styles.subtitle}>
              {mandatory
                ? `Versjon ${versionLabel(update.version, update.versionCode)} må installeres for å fortsette.`
                : `Versjon ${versionLabel(update.version, update.versionCode)}`}
              {update.installed?.version
                ? `  ·  du har ${versionLabel(update.installed.version, update.installed.versionCode)}`
                : ''}
            </Text>

            {update.releaseNotes?.length ? (
              <View style={styles.notes}>
                <Text style={styles.notesTitle}>Nytt i denne versjonen</Text>
                {update.releaseNotes.map((note, i) => (
                  <Text key={i} style={styles.note}>
                    •  {note}
                  </Text>
                ))}
              </View>
            ) : null}

            {state === 'downloading' ? (
              <View style={styles.progressWrap}>
                <Text style={styles.muted}>Laster ned oppdatering … {Math.round(progress * 100)} %</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
              </View>
            ) : null}

            {state === 'installing' ? (
              <View style={styles.hint}>
                <Text style={styles.hintText}>
                  Fikk du ikke spørsmål om å installere? Android må ha tillatelse til å installere oppdateringer fra
                  denne appen.
                </Text>
                <Pressable onPress={() => openInstallPermissionSettings().catch(() => {})}>
                  <Text style={styles.link}>Gi tillatelse i innstillinger</Text>
                </Pressable>
              </View>
            ) : null}

            {state === 'error' ? (
              <View style={styles.hint}>
                <Text style={styles.errorText}>Oppdateringen feilet: {error}</Text>
                <Pressable onPress={() => openInstallPermissionSettings().catch(() => {})}>
                  <Text style={styles.link}>Gi tillatelse til å installere apper</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.buttons}>
              <Pressable
                style={[styles.primary, state === 'downloading' && styles.busy]}
                onPress={start}
                disabled={state === 'downloading'}
              >
                {state === 'downloading' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>{state === 'idle' ? 'Oppdater nå' : 'Prøv igjen'}</Text>
                )}
              </Pressable>
              {!mandatory ? (
                <Pressable style={styles.secondary} onPress={close} disabled={state === 'downloading'}>
                  <Text style={styles.secondaryText}>Senere</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    gap: 8,
    ...cardShadow,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontFamily: fonts.headingBold, fontSize: 22, color: colors.text, textAlign: 'center' },
  subtitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, textAlign: 'center' },
  notes: { alignSelf: 'stretch', backgroundColor: '#f6f7f9', borderRadius: 14, padding: 14, gap: 4, marginTop: 6 },
  notesTitle: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase', marginBottom: 2 },
  note: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  progressWrap: { alignSelf: 'stretch', gap: 6, marginTop: 6 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  hint: { alignSelf: 'stretch', gap: 6, marginTop: 6 },
  hintText: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center' },
  errorText: { fontFamily: fonts.regular, fontSize: 13, color: '#b91c1c', textAlign: 'center' },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent, textAlign: 'center' },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  buttons: { alignSelf: 'stretch', gap: 8, marginTop: 10 },
  primary: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  busy: { opacity: 0.7 },
  primaryText: { fontFamily: fonts.semibold, fontSize: 15, color: '#fff' },
  secondary: { borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.muted },
});
