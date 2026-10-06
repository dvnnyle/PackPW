// Service A: Wallmob back office (https://wbo-etail.wallmob.com)
// The back office is an Angular app on top of a JSON API (bapi). We open it in the browser only to log in and read
// the API token it keeps in localStorage (valid about an hour), then call the API directly with fetch.
import type { BrowserContext, Page } from 'playwright';
import { newContext, saveSession } from '../browser/browser';
import { config, requireEnv } from '../config';
import type { ServiceAData } from '../types';
import { norwayMidnight } from '../utils/norway';

const SESSION = 'serviceA';

function baseUrl(): string {
  return requireEnv('SERVICE_A_URL').replace(/\/$/, '');
}

function isOnLoginPage(page: Page): boolean {
  return new URL(page.url()).pathname.startsWith('/login');
}

async function login(page: Page): Promise<void> {
  await page.goto(`${baseUrl()}/login`, { waitUntil: 'networkidle' });
  await page.fill('#LoginForm_username', requireEnv('SERVICE_A_USERNAME'));
  await page.fill('#LoginForm_password', requireEnv('SERVICE_A_PASSWORD'));
  await page.click('button[type=submit]');

  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: config.browserTimeoutMs });
  } catch {
    throw new Error('Service A login failed: still on the login page after submitting');
  }
}

interface ApiSession {
  token: string;
  expiresAt: number; // ms
}

let apiSession: ApiSession | null = null;
let pendingSession: Promise<ApiSession> | null = null;

// Opens the home page (logging in if the saved session has expired) and reads the API token.
async function openApiSession(): Promise<ApiSession> {
  const context = await newContext(SESSION);
  try {
    const page = await context.newPage();
    // Wallmob redirects to /login when the session has expired. The redirect is client-side and can land after
    // networkidle, so wait for either the boxes or the login form.
    await page.goto(`${baseUrl()}/home`, { waitUntil: 'networkidle' });
    await page.locator('.boxes-container, #LoginForm_username').first().waitFor({ timeout: config.browserTimeoutMs });
    if (isOnLoginPage(page)) {
      await login(page);
      await saveSession(context, SESSION);
      await page.locator('.boxes-container').first().waitFor({ timeout: config.browserTimeoutMs });
    }
    const stored = await page.evaluate(() => ({
      token: localStorage.getItem('ls.auth.access_token'),
      expireTime: localStorage.getItem('ls.auth.expire_time'),
    }));
    if (!stored.token) throw new Error('Wallmob API token not found after login');
    // expire_time is ms since epoch; renew 5 minutes early (fall back to 30 minutes if it is missing).
    const expireTime = Number(JSON.parse(stored.expireTime ?? 'null')) || Date.now() + 35 * 60_000;
    return { token: JSON.parse(stored.token), expiresAt: expireTime - 5 * 60_000 };
  } finally {
    await context.close();
  }
}

// Shared by concurrent calls, so several requests at once trigger one browser login.
function ensureApiSession(): Promise<ApiSession> {
  if (apiSession && Date.now() < apiSession.expiresAt) return Promise.resolve(apiSession);
  pendingSession ??= openApiSession()
    .then((session) => (apiSession = session))
    .finally(() => (pendingSession = null));
  return pendingSession;
}

// GET from Wallmob's JSON API; gets a fresh token when the current one has expired or is rejected.
async function apiGet<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { token } = await ensureApiSession();
    const response = await fetch(`https://bapi-etail.wallmob.com${path}`, {
      headers: { authorization: `Bearer ${token}`, 'wm-api-version': 'latest', accept: 'application/json' },
    });
    if (response.status === 401 && attempt === 0) {
      apiSession = null;
      continue;
    }
    if (!response.ok) throw new Error(`Wallmob API returned ${response.status}`);
    return (await response.json()) as T;
  }
  throw new Error('Wallmob API: not authorized after logging in again');
}

// starttime/endtime covering `date` in Norwegian time.
function dayRange(date: string): string {
  const start = norwayMidnight(date);
  return `starttime=${start}&endtime=${start + 86_399}`;
}

interface Performance {
  turnover?: number; // øre
  quantity?: number;
  orders_count?: number;
  gross_margin?: number;
  top_users?: { user_name?: string; turnover?: string }[]; // turnover in øre, best first
}

function performance(date: string, reports: string[]): Promise<Performance> {
  const query = encodeURIComponent(JSON.stringify(reports));
  return apiGet(`/reports/performance?${dayRange(date)}&interval_grouping=999999999&reports=${query}`);
}

function minusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Employees ranked by sales on `date` (kr incl. VAT), best first, max 5 — Wallmob's "Mestselgende brukere".
export async function getServiceATopSellers(date: string): Promise<{ name: string; revenue: number }[]> {
  const { top_users } = await performance(date, ['top_users']);
  return (top_users ?? [])
    .map((u) => ({ name: u.user_name?.trim() || 'Ukjent', revenue: Number(u.turnover ?? 0) / 100 }))
    .slice(0, 5);
}

// Turnover in kr for each hour (0–23, Norwegian time) of `date`.
export async function getServiceAHourly(date: string): Promise<number[]> {
  const rows = await apiGet<{ intervals_since_start: string; turnover: string }[]>(
    `/reports/turnover?${dayRange(date)}&interval_grouping=3600`,
  );

  // turnover is in øre.
  const hours = new Array<number>(24).fill(0);
  for (const row of rows) {
    const hour = Number(row.intervals_since_start);
    if (hour >= 0 && hour < 24) hours[hour] += Number(row.turnover) / 100;
  }
  return hours;
}

// Today's figures for the Norwegian day. Not read from the home page boxes: those count the day in UTC,
// so between midnight and 01:00/02:00 they still show yesterday.
export async function getServiceAData(date: string): Promise<ServiceAData> {
  // "Same weekday last year" is 364 days back, like the back office. Its own last_year_turnover is
  // only right for UTC days, so it is looked up directly.
  const [today, lastYear] = await Promise.all([
    performance(date, ['turnover', 'quantity', 'orders_count', 'gross_margin']),
    performance(minusDays(date, 364), ['turnover']),
  ]);

  const revenue = today.turnover != null ? today.turnover / 100 : null;
  const lastYearRevenue = lastYear.turnover != null ? lastYear.turnover / 100 : null;
  return {
    revenueToday: revenue,
    revenueLastYearSameWeekday: lastYearRevenue,
    revenueChangePercent:
      revenue != null && lastYearRevenue ? ((revenue - lastYearRevenue) / lastYearRevenue) * 100 : null,
    productsSoldToday: today.quantity ?? null,
    grossMarginPercent: today.gross_margin ?? null,
    customersToday: today.orders_count ?? null,
  };
}
