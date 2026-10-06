import { createContext, useContext, useMemo, useState } from 'react';

// Playworld locations. A location becomes selectable once the backend has its logins (`available`).
// Triaden uses the same systems as Sørlandet (Extanda Go, NordPay, FunButler, Planday); only its credentials are missing.
export const LOCATIONS = [
  { id: 'sorlandet', name: 'Sørlandet', available: true },
  { id: 'triaden', name: 'Triaden', available: false },
];

const LocationContext = createContext({ location: LOCATIONS[0], setLocationId: () => {} });

// Holds the chosen location for the whole app (all pages follow it).
export function LocationProvider({ children }) {
  const [locationId, setLocationId] = useState(LOCATIONS[0].id);
  const value = useMemo(
    () => ({ location: LOCATIONS.find((l) => l.id === locationId) ?? LOCATIONS[0], setLocationId }),
    [locationId],
  );
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  return useContext(LocationContext);
}
