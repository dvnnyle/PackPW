import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { cardShadow, colors, fonts } from '../theme';
import { useAuth } from '../auth';

const logo = require('../../assets/branding/logo.png');

// Shown on the phone until the user has logged in with the app password (or the demo password).
export default function LoginScreen() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Image source={logo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Playworld Hub</Text>
        <Text style={styles.muted}>Logg inn med passordet du har fått</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
          placeholder="Passord"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          returnKeyType="go"
          accessibilityLabel="Passord"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.button, (!password || busy) && styles.buttonOff]} onPress={submit} disabled={!password || busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Logg inn</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: 16 },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    gap: 12,
    alignItems: 'center',
    ...cardShadow,
  },
  logo: { width: 140, height: 115 },
  title: { fontFamily: fonts.headingBold, fontSize: 26, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, textAlign: 'center' },
  input: {
    alignSelf: 'stretch',
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#f6f7f9',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: { fontFamily: fonts.medium, fontSize: 14, color: '#b91c1c', textAlign: 'center' },
  button: { alignSelf: 'stretch', backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  buttonOff: { opacity: 0.5 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 16, color: '#fff' },
});
