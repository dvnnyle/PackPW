import { createContext, useContext } from 'react';

// Lets a sideways-scrolling strip inside Oversikt's location pager (the weather hours) pause the pager while
// the finger is on it; otherwise the pager takes the swipe and the strip can't scroll. Outside the pager it's a no-op.
export const PagerLockContext = createContext(() => {});
export const usePagerLock = () => useContext(PagerLockContext);
