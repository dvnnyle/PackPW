import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Hidden browser unless HEADLESS=false (servers like Render have no screen).
  headless: process.env.HEADLESS !== 'false',
  // When set, every /api request except /api/health must send it in the x-api-key header.
  apiKey: process.env.API_KEY ?? '',
  // App and website login password (see auth.ts). Empty = nobody can log in (except local development).
  appPassword: process.env.APP_PASSWORD ?? '',
  // Refresh today's data in the background every N minutes (0 = off). On by default when deployed
  // (API_KEY set), so the cache stays warm without an external cron job.
  warmupMinutes: Number(process.env.WARMUP_INTERVAL_MINUTES ?? (process.env.API_KEY ? 10 : 0)),
  // Refresh today's sales figures (Oversikt + Statistikk) every N seconds so both pages show the same, at most
  // a minute old, numbers. 0 = off.
  liveRefreshSeconds: Number(process.env.LIVE_REFRESH_SECONDS ?? 60),
  cacheTtlMs: Number(process.env.CACHE_TTL_SECONDS ?? 60) * 1000,
  // How long browser steps (page loads, logins) may take. Generous because small servers (Render free: 0.1 CPU)
  // run Chromium very slowly.
  browserTimeoutMs: Number(process.env.BROWSER_TIMEOUT_SECONDS ?? 90) * 1000,
};

// Locations: Sørlandet uses the plain variable names (SERVICE_A_USERNAME, …); other locations the same names with
// their id as prefix (TRIADEN_SERVICE_A_USERNAME, …). URLs fall back to Sørlandet's, since all locations use the
// same systems. A location without any of its own logins isn't connected yet (the app shows it as "Kommer snart"),
// so adding its variables on Render (and redeploying) is all it takes to make it live; no app build needed.
const LOGIN_VARS = ['SERVICE_A_USERNAME', 'SERVICE_B_USERNAME', 'FUNBUTLER_USERNAME', 'PLANDAY_USERNAME'];
const envPrefix = (location: string) => (location === 'sorlandet' ? '' : `${location.toUpperCase()}_`);

export function locationEnv(location: string, name: string): string {
  const own = process.env[`${envPrefix(location)}${name}`];
  if (own) return own;
  if (name.endsWith('_URL')) return requireEnv(name);
  return requireEnv(`${envPrefix(location)}${name}`);
}

export function hasLogins(location: string): boolean {
  return location === 'sorlandet' || LOGIN_VARS.some((name) => process.env[`${envPrefix(location)}${name}`]);
}

// Saved browser session per service and location ("serviceA", "serviceA-triaden").
export const sessionName = (service: string, location: string) =>
  location === 'sorlandet' ? service : `${service}-${location}`;

// Reads a required variable from .env. The error names the variable but never its value.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}
