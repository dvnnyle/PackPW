import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { fetchPushPrefs, savePushPrefs, sendTestPush } from '../api';
import { getPushToken } from '../push';
import { colors, fonts } from '../theme';
import PageHeader from './PageHeader';
import { Group, NOTIFICATION_KINDS, Row, ToggleRow } from './SettingsScreen';

// Innstillinger → Personlige varsler: which notifications this phone gets (stored per phone on the server).
export default function VarslerScreen() {
  // undefined = loading, null = this device gets no notifications (website, or notifications not allowed).
  const [push, setPush] = useState(undefined); // { token, prefs }
  const [testState, setTestState] = useState(null); // null | 'sending' | text after sending

  useEffect(() => {
    getPushToken()
      .then((token) => (token ? fetchPushPrefs(token).then((prefs) => setPush({ token, prefs })) : setPush(null)))
      .catch(() => setPush(null));
  }, []);

  // Switches flip at once; the server's answer (or the old value, if saving fails) follows.
  const toggle = (key, value) => {
    const before = push;
    setPush({ ...push, prefs: { ...push.prefs, [key]: value } });
    savePushPrefs(push.token, { [key]: value })
      .then((prefs) => setPush((p) => (p ? { ...p, prefs } : p)))
      .catch(() => setPush(before));
  };

  const sendTest = async () => {
    setTestState('sending');
    try {
      const { phones } = await sendTestPush();
      setTestState(`Sendt til ${phones} ${phones === 1 ? 'telefon' : 'telefoner'}`);
    } catch {
      setTestState('Kunne ikke sende testvarsel');
    }
  };

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.back} onPress={() => router.navigate('/innstillinger')} accessibilityRole="link" hitSlop={8}>
          <Ionicons name="chevron-back" size={18} color={colors.accent} />
          <Text style={styles.backText}>Innstillinger</Text>
        </Pressable>

        <PageHeader title="Varsler" subtitle="Velg hva denne telefonen får" icon="notifications-outline" />

        {push === null ? (
          <Group title="Denne enheten">
            <Row
              icon="notifications-off-outline"
              label="Ingen varsler på denne enheten"
              detail="Bare i appen på telefonen, med varsler tillatt i telefonens innstillinger"
              last
            />
          </Group>
        ) : push ? (
          // One group per topic (Salg, Bookinger, Ansatte, Vær), in the order of NOTIFICATION_KINDS.
          [...new Set(NOTIFICATION_KINDS.map((k) => k.group))].map((group) => {
            const kinds = NOTIFICATION_KINDS.filter((k) => k.group === group);
            return (
              <Group key={group} title={group}>
                {kinds.map((k, i) => (
                  <ToggleRow
                    key={k.key}
                    icon={k.icon}
                    label={k.label}
                    detail={k.detail}
                    value={push.prefs[k.key] !== false}
                    onChange={(v) => toggle(k.key, v)}
                    last={i === kinds.length - 1}
                  />
                ))}
              </Group>
            );
          })
        ) : null}

        <Group title="Test">
          <Row
            icon="paper-plane-outline"
            label="Send testvarsel"
            detail={testState && testState !== 'sending' ? testState : 'Sender et varsel til alle telefoner med appen'}
            onPress={sendTest}
            busy={testState === 'sending'}
            last
          />
        </Group>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, minHeight: 0, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48, gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accent },
});
