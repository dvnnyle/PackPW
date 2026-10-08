import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { clearCache } from './apiCache';
import { login as apiLogin, setAuthToken, setOnUnauthorized } from './api';

// The app login (one shared password; the backend decides whether it gives real or demo data). The token is kept
// in the phone's secure storage. The website has no app login: it is behind the browser's own login.
export const needsLogin = Platform.OS !== 'web';
const TOKEN_KEY = 'playworld-token';
const DEMO_KEY = 'playworld-demo';

const store = needsLogin ? require('expo-secure-store') : null;

function readSaved() {
  try {
    const token = store?.getItem(TOKEN_KEY) ?? null;
    return { token, demo: store?.getItem(DEMO_KEY) === '1' };
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
    store?.deleteItemAsync(TOKEN_KEY).catch(() => {});
    store?.deleteItemAsync(DEMO_KEY).catch(() => {});
    setSession({ token: null, demo: false });
  }, []);

  const login = useCallback(async (password) => {
    const { token, demo } = await apiLogin(password);
    clearCache();
    setAuthToken(token);
    await store?.setItemAsync(TOKEN_KEY, token);
    await store?.setItemAsync(DEMO_KEY, demo ? '1' : '0');
    setSession({ token, demo });
  }, []);

  // The server rejected the token (expired, or the password was changed): back to the login screen.
  useEffect(() => setOnUnauthorized(needsLogin ? logout : null), [logout]);

  const value = useMemo(() => ({ ...session, login, logout }), [session, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
