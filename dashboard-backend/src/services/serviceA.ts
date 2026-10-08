// Service A: Wallmob back office (https://wbo-etail.wallmob.com)
// The back office is an Angular app on top of a JSON API (bapi). We open it in the browser only to log in and read
// the API token it keeps in localStorage (valid about an hour), then call the API directly with fetch.
import type { Page } from 'playwright';
import { newContext, saveSession } from '../browser/browser';
import { config, locationEnv, sessionName } from '../config';
import type { ServiceAData } from '../types';
import { norwayMidnight, todayInNorway } from '../utils/norway';

const SESSION = 'serviceA';

function baseUrl(location: string): string {
  return locationEnv(location, 'SERVICE_A_URL').replace(/\/$/, '');
}

function isOnLoginPage(page: Page): boolean {
  return new URL(page.url()).pathname.startsWith('/login');
}

async function login(page: Page, location: string): Promise<void> {
  await page.goto(`${baseUrl(location)}/login`, { waitUntil: 'networkidle' });
  await page.fill('#LoginForm_username', locationEnv(location, 'SERVICE_A_USERNAME'));
  await page.fill('#LoginForm_password', locationEnv(location, 'SERVICE_A_PASSWORD'));
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

// Per location.
const apiSessions = new Map<string, ApiSession>();
const pendingSessions = new Map<string, Promise<ApiSession>>();

// Opens the home page (logging in if the saved session has expired) and reads the API token.
async function openApiSession(location: string): Promise<ApiSession> {
  const session = sessionName(SESSION, location);
  const context = await newContext(session);
  try {
    const page = await context.newPage();
    // Wallmob redirects to /login when the session has expired. The redirect is client-side and can land after
    // networkidle, so wait for either the boxes or the login form.
    await page.goto(`${baseUrl(location)}/home`, { waitUntil: 'networkidle' });
    await page.locator('.boxes-container, #LoginForm_username').first().waitFor({ timeout: config.browserTimeoutMs });
    if (isOnLoginPage(page)) {
      await login(page, location);
      await saveSession(context, session);
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
function ensureApiSession(location: string): Promise<ApiSession> {
  const current = apiSessions.get(location);
  if (current && Date.now() < current.expiresAt) return Promise.resolve(current);
  let pending = pendingSessions.get(location);
  if (!pending) {
    pending = openApiSession(location)
      .then((session) => (apiSessions.set(location, session), session))
      .finally(() => pendingSessions.delete(location));
    pendingSessions.set(location, pending);
  }
  return pending;
}

// GET from Wallmob's JSON API; gets a fresh token when the current one has expired or is rejected.
async function apiGet<T>(location: string, path: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { token } = await ensureApiSession(location);
    const response = await fetch(`https://bapi-etail.wallmob.com${path}`, {
      headers: { authorization: `Bearer ${token}`, 'wm-api-version': 'latest', accept: 'application/json' },
    });
    if (response.status === 401 && attempt === 0) {
      apiSessions.delete(location);
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

function performance(location: string, date: string, reports: string[]): Promise<Performance> {
  const query = encodeURIComponent(JSON.stringify(reports));
  return apiGet(location, `/reports/performance?${dayRange(date)}&interval_grouping=999999999&reports=${query}`);
}

function minusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Employees ranked by sales on `date` (kr incl. VAT), best first, max 5 — Wallmob's "Mestselgende brukere".
export async function getServiceATopSellers(
  date: string,
  location = 'sorlandet',
): Promise<{ name: string; revenue: number }[]> {
  const { top_users } = await performance(location, date, ['top_users']);
  return (top_users ?? [])
    .map((u) => ({ name: u.user_name?.trim() || 'Ukjent', revenue: Number(u.turnover ?? 0) / 100 }))
    .slice(0, 5);
}

// Turnover in kr for each hour (0–23, Norwegian time) of `date`.
// Wallmob's turnover report lags behind its performance report (which Oversikt uses): recent sales show up
// there right away but in the turnover figures only later. So the performance day total is fetched too, and
// for today the difference is added to the current hour, keeping the chart's total equal to Oversikt's.
export async function getServiceAHourly(date: string, location = 'sorlandet'): Promise<number[]> {
  type Row = { intervals_since_start: string; turnover: string };
  const [rows, day] = await Promise.all([
    apiGet<Row[]>(location, `/reports/turnover?${dayRange(date)}&interval_grouping=3600`),
    performance(location, date, ['turnover']),
  ]);

  // turnover is in øre.
  const hours = new Array<number>(24).fill(0);
  for (const row of rows) {
    const hour = Number(row.intervals_since_start);
    if (hour >= 0 && hour < 24) hours[hour] += Number(row.turnover) / 100;
  }

  const dayTotal = (day.turnover ?? 0) / 100;
  const missing = Math.round((dayTotal - hours.reduce((a, b) => a + b, 0)) * 100) / 100;
  if (missing > 0 && date === todayInNorway()) {
    const currentHour = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()),
    );
    hours[currentHour] += missing;
  }
  return hours;
}

// Today's figures for the Norwegian day. Not read from the home page boxes: those count the day in UTC,
// so between midnight and 01:00/02:00 they still show yesterday.
export async function getServiceAData(date: string, location = 'sorlandet'): Promise<ServiceAData> {
  // "Same weekday last year" is 364 days back, like the back office. Its own last_year_turnover is
  // only right for UTC days, so it is looked up directly.
  const [today, lastYear] = await Promise.all([
    performance(location, date, ['turnover', 'quantity', 'orders_count', 'gross_margin']),
    performance(location, minusDays(date, 364), ['turnover']),
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
