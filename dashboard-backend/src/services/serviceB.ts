// Service B / location 2: NordPay admin (https://admin.nordpay.no)
// NordPay's admin pages are server-rendered HTML. We fetch them directly with the browser's saved login cookies
// (fast) and only open a browser to log in when those cookies stop working.
import type { Page } from 'playwright';
import { browserUserAgent, newContext, saveSession, sessionCookieHeader } from '../browser/browser';
import { config, locationEnv, sessionName } from '../config';
import type { ServiceBData } from '../types';
import { parseTable } from '../utils/htmlTable';
import { parseNumber } from '../utils/parseNumber';

const SESSION = 'serviceB';

function baseUrl(location: string): string {
  return locationEnv(location, 'SERVICE_B_URL').replace(/\/$/, '');
}

function isOnLoginPage(page: Page): boolean {
  return new URL(page.url()).pathname.startsWith('/login');
}

async function login(page: Page, location: string): Promise<void> {
  await page.goto(`${baseUrl(location)}/login`, { waitUntil: 'networkidle' });
  await page.fill('#signInEmail', locationEnv(location, 'SERVICE_B_USERNAME'));
  await page.fill('#signInPassword', locationEnv(location, 'SERVICE_B_PASSWORD'));
  await page.check('input[name=remember]');
  await page.click('button[type=submit]');

  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: config.browserTimeoutMs });
  } catch {
    throw new Error('Service B login failed: still on the login page after submitting');
  }
}

// Logs in with the browser (also passing Cloudflare's check) and saves the cookies for fetchHtml.
async function refreshLogin(location: string): Promise<void> {
  const session = sessionName(SESSION, location);
  const context = await newContext(session);
  try {
    const page = await context.newPage();
    await page.goto(`${baseUrl(location)}/dashboard`, { waitUntil: 'networkidle' });
    if (isOnLoginPage(page)) await login(page, location);
    await saveSession(context, session);
  } finally {
    await context.close();
  }
}

// Shared by concurrent requests (per location), so several at once trigger one browser login.
const pendingLogins = new Map<string, Promise<void>>();

// GET an admin page's HTML with the saved cookies; logs in again once if NordPay sends us to /login.
async function fetchHtml(location: string, path: string): Promise<string> {
  const url = `${baseUrl(location)}${path}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      headers: { cookie: sessionCookieHeader(sessionName(SESSION, location), url), 'user-agent': await browserUserAgent(), accept: 'text/html' },
      redirect: 'manual',
    });
    const redirect = response.headers.get('location') ?? '';
    const html = response.status === 200 ? await response.text() : '';
    if (response.status === 200 && !html.includes('id="signInEmail"')) return html;
    if (attempt === 0 && (redirect.includes('/login') || html.includes('id="signInEmail"') || response.status === 403)) {
      let pending = pendingLogins.get(location);
      if (!pending) {
        pending = refreshLogin(location).finally(() => pendingLogins.delete(location));
        pendingLogins.set(location, pending);
      }
      await pending;
      continue;
    }
    throw new Error(`NordPay request failed (HTTP ${response.status})`);
  }
  throw new Error('NordPay request failed: still not logged in after logging in again');
}

// Column values of a parsed table row by header name.
function column(headers: string[], row: string[], name: string): string {
  return row[headers.indexOf(name)] ?? '';
}

// Sales in kr for each hour (0–23) of `date`, from the completed orders in the Orders list (filtered to that day).
// These add up to the Sales Report's daily total; the built-in Time Report does not.
export async function getServiceBHourly(date: string, location = 'sorlandet'): Promise<number[]> {
  const path = (page: number) => `/manage/orders?starts=${date}&ends=${date}&page=${page}`;
  const first = await fetchHtml(location, path(1));
  // About 50 orders per page; the pager links say how many pages the day has.
  const pageCount = Math.max(1, ...[...first.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1])));
  const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_, i) => fetchHtml(location, path(i + 2))));

  const hours = new Array<number>(24).fill(0);
  for (const html of [first, ...rest]) {
    const { headers, rows } = parseTable(html);
    for (const row of rows) {
      const createdAt = column(headers, row, 'Created At'); // "2026-10-05 14:48:21", Norwegian time
      if (createdAt.startsWith(date) && /completed/i.test(column(headers, row, 'Status'))) {
        hours[Number(createdAt.slice(11, 13))] += parseNumber(column(headers, row, 'Totals')) ?? 0;
      }
    }
  }
  return hours;
}

// Sales and completed orders for `date`, from the Sales Report (one row per day; no row means no sales).
// Works for any day, unlike the dashboard's "Dagens salg" widget, and gives the same numbers for today.
export async function getServiceBData(date: string, location = 'sorlandet'): Promise<ServiceBData> {
  const { headers, rows } = parseTable(await fetchHtml(location, `/manage/reports/sales?starts=${date}&ends=${date}`));
  const row = rows.find((r) => r[0] === date);
  return {
    salesToday: row ? parseNumber(column(headers, row, 'Sales Inc. VAT')) : 0,
    ordersToday: row ? parseNumber(column(headers, row, 'Total Orders')) : 0,
  };
}
