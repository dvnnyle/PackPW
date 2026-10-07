import { createContext, useContext, useMemo, useState } from 'react';
import { setApiLocation } from './api';

// Playworld locations. `demo` = the backend serves made-up data until the real logins are configured.
// Triaden uses the same systems as Sørlandet (Extanda Go, NordPay, FunButler, Planday); only its credentials are missing.
// `place` is used for the weather card title.
// The Google Play build uses a demo-only API key, so every location shows made-up data there.
const playBuild = process.env.EXPO_PUBLIC_DISTRIBUTION === 'play';
export const LOCATIONS = [
  { id: 'sorlandet', name: 'Sørlandet', place: 'Sørlandsparken', available: true, demo: playBuild },
  { id: 'triaden', name: 'Triaden', place: 'Lørenskog', available: true, demo: true },
];

const LocationContext = createContext({ location: LOCATIONS[0], setLocationId: () => {} });

// Holds the chosen location for the whole app (all pages follow it).
export function LocationProvider({ children }) {
  const [locationId, setLocationIdState] = useState(LOCATIONS[0].id);
  const value = useMemo(
    () => ({
      location: LOCATIONS.find((l) => l.id === locationId) ?? LOCATIONS[0],
      // Tell the API module first, so the screens that remount on the switch already ask for the new location.
      setLocationId: (id) => {
        setApiLocation(id);
        setLocationIdState(id);
      },
    }),
    [locationId],
  );
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  return useContext(LocationContext);
}
