import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Hidden browser unless HEADLESS=false (servers like Render have no screen).
  headless: process.env.HEADLESS !== 'false',
  // When set, every /api request except /api/health must send it in the x-api-key header.
  apiKey: process.env.API_KEY ?? '',
  // Login for the website (browser login box / HTTP Basic Auth). The website is only served when WEB_PASSWORD is set.
  webUser: process.env.WEB_USER ?? 'playworld',
  webPassword: process.env.WEB_PASSWORD ?? '',
  // Refresh today's data in the background every N minutes (0 = off). On by default when deployed
  // (API_KEY set), so the cache stays warm without an external cron job.
  warmupMinutes: Number(process.env.WARMUP_INTERVAL_MINUTES ?? (process.env.API_KEY ? 10 : 0)),
  cacheTtlMs: Number(process.env.CACHE_TTL_SECONDS ?? 60) * 1000,
  // How long browser steps (page loads, logins) may take. Generous because small servers (Render free: 0.1 CPU)
  // run Chromium very slowly.
  browserTimeoutMs: Number(process.env.BROWSER_TIMEOUT_SECONDS ?? 90) * 1000,
};

// Reads a required variable from .env. The error names the variable but never its value.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}
