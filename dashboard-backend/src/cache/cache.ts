import { config } from '../config';
import { todayInNorway } from '../utils/norway';

interface Entry<T> {
  value: T;
  expiresAt: number;
  storedAt: number;
}

const entries = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

// An expired value is still served (instantly) while a fresh one is fetched in the background, so the app
// almost never waits for the slow sites — but only up to 15 × its TTL: 15 minutes for today's figures (60 s
// TTL), much longer for past days that don't change. Older than that, the request waits for live data, so
// stale numbers can't linger for hours if the cron warmup stops running.
const STALE_FACTOR = 15;

// Fetches once even if several requests arrive together, and stores the result.
function refresh<T>(key: string, ttlMs: number, fetch: () => Promise<T>): Promise<T> {
  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const promise = fetch()
    .then((value) => {
      entries.set(key, { value, expiresAt: Date.now() + ttlMs, storedAt: Date.now() });
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

// Returns cached data while it is fresh. When it has expired (but is less than 15 × TTL old) it is returned
// right away and refreshed in the background ("stale-while-revalidate").
// `fresh` (the app's refresh button) always waits for live data, sharing a fetch that is already running.
export async function cached<T>(key: string, ttlMs: number, fetch: () => Promise<T>, fresh = false): Promise<T> {
  const entry = entries.get(key) as Entry<T> | undefined;
  if (!fresh && entry) {
    if (entry.expiresAt > Date.now()) return entry.value;
    if (Date.now() - entry.storedAt < ttlMs * STALE_FACTOR) {
      refresh(key, ttlMs, fetch).catch((err) => console.error(`[cache] Background refresh of ${key} failed:`, err));
      return entry.value;
    }
  }
  return refresh(key, ttlMs, fetch);
}

// Past days don't change any more, so cache them for 6 hours; today (and later) uses the normal short TTL.
export function ttlForDate(date: string): number {
  return date < todayInNorway() ? 6 * 60 * 60_000 : config.cacheTtlMs;
}

// True when the request asks to skip the cache: ?fresh=1
export function wantsFresh(query: Record<string, unknown>): boolean {
  return query.fresh === '1';
}
