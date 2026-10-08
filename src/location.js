import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchLocations, setApiLocation } from './api';

// Playworld locations. `available` = the location's logins are set on the server; the others show as "Kommer snart"
// in the picker and get no page. The server says which ones are live (/api/locations), so a location goes live
// without a new app build; the values here are only used until that answer arrives.
// Triaden uses the same systems as Sørlandet (Extanda Go, NordPay, FunButler, Planday); only its credentials are missing.
// `place` is used for the weather card title.
export const LOCATIONS = [
  { id: 'sorlandet', name: 'Sørlandet', place: 'Sørlandsparken', available: true },
  { id: 'triaden', name: 'Triaden', place: 'Lørenskog', available: false },
];

const LocationContext = createContext({ location: LOCATIONS[0], setLocationId: () => {} });

// Holds the chosen location for the whole app (all pages follow it).
export function LocationProvider({ children }) {
  const [locationId, setLocationIdState] = useState(LOCATIONS[0].id);
  const [live, setLive] = useState(null); // Set of live location ids, from the server

  useEffect(() => {
    const apply = (list) => setLive(new Set(list.filter((l) => l.live).map((l) => l.id)));
    fetchLocations(apply).then(apply).catch(() => {});
  }, []);

  const value = useMemo(() => {
    const withLive = (l) => (live ? { ...l, available: live.has(l.id) } : l);
    const locations = LOCATIONS.map(withLive);
    return {
      locations,
      location: locations.find((l) => l.id === locationId) ?? locations[0],
      // Tell the API module first, so the screens that remount on the switch already ask for the new location.
      setLocationId: (id) => {
        setApiLocation(id);
        setLocationIdState(id);
      },
    };
  }, [locationId, live]);
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  return useContext(LocationContext);
}
