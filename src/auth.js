import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { clearCache } from './apiCache';
import { login as apiLogin, setAuthToken, setOnUnauthorized } from './api';
import { registerForPush } from './push';

// The login (one shared password; the backend decides whether it gives real or demo data), the same on the phone
// and the website. The token is kept in the phone's secure storage, or the browser's localStorage on the web.
const TOKEN_KEY = 'playworld-token';
const DEMO_KEY = 'playworld-demo';

const store =
  Platform.OS === 'web'
    ? {
        getItem: (key) => globalThis.localStorage?.getItem(key) ?? null,
        setItemAsync: async (key, value) => globalThis.localStorage?.setItem(key, value),
        deleteItemAsync: async (key) => globalThis.localStorage?.removeItem(key),
      }
    : require('expo-secure-store');

function readSaved() {
  try {
    const token = store.getItem(TOKEN_KEY) ?? null;
    return { token, demo: store.getItem(DEMO_KEY) === '1' };
  } catch {
    return { token: null, demo: false };
  }
}

const AuthContext = createContext({ token: null, demo: false, login: async () => {}, logout: () => {} });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const saved = readSaved();
    setAuthToken(saved.token);
    return saved;
  });

  const logout = useCallback(() => {
    setAuthToken(null);
    clearCache();
    store.deleteItemAsync(TOKEN_KEY).catch(() => {});
    store.deleteItemAsync(DEMO_KEY).catch(() => {});
    setSession({ token: null, demo: false });
  }, []);

  const login = useCallback(async (password) => {
    const { token, demo } = await apiLogin(password);
    clearCache();
    setAuthToken(token);
    // Saving can fail (private browsing): the login still works until the app is closed.
    await store.setItemAsync(TOKEN_KEY, token).catch(() => {});
    await store.setItemAsync(DEMO_KEY, demo ? '1' : '0').catch(() => {});
    setSession({ token, demo });
  }, []);

  // The server rejected the token (expired, or the password was changed): back to the login screen.
  useEffect(() => setOnUnauthorized(logout), [logout]);

  // Logged in with the staff password: register this phone for notifications (demo logins get none).
  useEffect(() => {
    if (session.token && !session.demo) registerForPush();
  }, [session.token, session.demo]);

  const value = useMemo(() => ({ ...session, login, logout }), [session, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
