import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

// One reload for the whole app (the button in the top bar / sidebar, or pull-to-refresh on any page).
// refreshAll() bumps `refreshKey`; every screen and section that sees it change fetches fresh data from the
// sites (skipping the backend cache) and calls finishRefresh() when done.
const RefreshContext = createContext({ refreshKey: 0, refreshing: false, refreshAll: () => {}, finishRefresh: () => {} });

export function RefreshProvider({ children }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const fallback = useRef(null);

  const finishRefresh = useCallback(() => {
    clearTimeout(fallback.current);
    setRefreshing(false);
  }, []);

  const refreshAll = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    // Stop the spinner even if no screen reports back (e.g. a network error that never resolves).
    clearTimeout(fallback.current);
    fallback.current = setTimeout(() => setRefreshing(false), 30_000);
  }, []);

  const value = useMemo(
    () => ({ refreshKey, refreshing, refreshAll, finishRefresh }),
    [refreshKey, refreshing, refreshAll, finishRefresh],
  );
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefresh() {
  return useContext(RefreshContext);
}
