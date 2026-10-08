// Service D: Planday staff schedule (https://playworld.planday.com).
// The schedule board loads shifts, employees and employee groups as JSON from Planday's APIs using a
// "platform" access token (valid ~4 hours). We open the board in the browser only to log in and capture that
// token, then call the same APIs directly with fetch, which takes well under a second.
import { newContext, saveSession } from '../browser/browser';
import { config, locationEnv, sessionName } from '../config';
import type { StaffShift } from '../types';

const SESSION = 'planday';
const SHIFT_API = 'https://scheduling-shift-api.prod-westeurope.planday.cloud';
const PEOPLE_API = 'https://scheduling-people-api.prod-westeurope.planday.cloud';

interface ApiSession {
  headers: Record<string, string>; // authorization + x-clientid, as the board sends them
  departmentId: string;
  expiresAt: number; // ms
}

interface RawShift {
  employee_id?: number | null;
  employee_group_id?: number | null;
  date: string;
  start_time: string;
  end_time: string;
  status: string; // Assigned, Open, ForSale, PunchclockStarted, PunchclockFinished, …
  punch_in_date_time?: string;
  punch_out_date_time?: string;
}

// Per location.
const apiSessions = new Map<string, ApiSession>();

function baseUrl(location: string): string {
  return locationEnv(location, 'PLANDAY_URL').replace(/\/$/, '');
}

// Opens the schedule board (logging in if needed) and captures the API token from its first data request.
async function openApiSession(location: string): Promise<ApiSession> {
  const session = sessionName(SESSION, location);
  const context = await newContext(session);
  try {
    const page = await context.newPage();
    let headers: Record<string, string> | null = null;
    let expiresIn = 3600;
    page.on('request', (r) => {
      const h = r.headers();
      if (!headers && r.url().includes('/day_based/') && h.authorization) {
        headers = { authorization: h.authorization, 'x-clientid': h['x-clientid'] ?? '' };
      }
    });
    page.on('response', async (r) => {
      if (!r.url().includes('/connect/token')) return;
      const body = (await r.json().catch(() => null)) as { platform_access_token?: string; expires_in?: number } | null;
      if (body?.platform_access_token && body.expires_in) expiresIn = body.expires_in;
    });

    // Planday sends us to id.planday.com when the saved login has expired.
    await page.goto(`${baseUrl(location)}/schedule`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => url.pathname.startsWith('/schedule/') || url.hostname === 'id.planday.com', {
      timeout: config.browserTimeoutMs,
    });
    if (new URL(page.url()).hostname === 'id.planday.com') {
      await page.click('#cookie-consent-button', { timeout: 3_000 }).catch(() => {});
      await page.fill('#Username', locationEnv(location, 'PLANDAY_USERNAME'));
      await page.fill('#Password', locationEnv(location, 'PLANDAY_PASSWORD'));
      await page.click('#MainLoginButton');
      try {
        await page.waitForURL((url) => url.pathname.startsWith('/schedule/'), { timeout: config.browserTimeoutMs });
      } catch {
        throw new Error('Planday login failed: still on the login page after submitting');
      }
      await saveSession(context, session);
    }

    // The board lives at /schedule/{departmentId}/board/…
    const departmentId = new URL(page.url()).pathname.split('/')[2];
    const deadline = Date.now() + config.browserTimeoutMs;
    while (!headers) {
      if (Date.now() > deadline) throw new Error('Planday board did not request any schedule data');
      await page.waitForTimeout(200);
    }
    // Renew 10 minutes early.
    return { headers, departmentId, expiresAt: Date.now() + (expiresIn - 600) * 1000 };
  } finally {
    await context.close();
  }
}

// Shared by concurrent calls (per location), so three parallel requests trigger one browser login, not three.
const pendingSessions = new Map<string, Promise<ApiSession>>();
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

// GET a Planday API URL; gets a fresh token when the current one has expired or is rejected.
async function apiGet<T>(location: string, url: (departmentId: string) => string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await ensureApiSession(location);
    const response = await fetch(url(session.departmentId), {
      headers: { ...session.headers, accept: 'application/json' },
    });
    if (response.status === 401 && attempt === 0) {
      apiSessions.delete(location);
      continue;
    }
    if (!response.ok) throw new Error(`Planday request failed (HTTP ${response.status})`);
    return (await response.json()) as T;
  }
  throw new Error('Planday request failed: not authorized after logging in again');
}

// Monday and Sunday (YYYY-MM-DD) of the week containing `date`.
export function weekOf(date: string): { monday: string; sunday: string } {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const monday = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return { monday, sunday: d.toISOString().slice(0, 10) };
}

// All shifts in the week containing `date`, with employee and group names, sorted by day and start time.
export async function getStaffWeek(date: string, location = 'sorlandet'): Promise<StaffShift[]> {
  const { monday, sunday } = weekOf(date);
  const range = `from=${monday}&to=${sunday}`;
  const [{ shifts }, { employees }, { employee_groups: groups }] = await Promise.all([
    apiGet<{ shifts: RawShift[] }>(location, (dep) => `${SHIFT_API}/scheduling/departments/${dep}/day_based/shifts?${range}`),
    apiGet<{ employees: { id: number; display_name: string }[] }>(
      location,
      (dep) => `${PEOPLE_API}/scheduling/departments/${dep}/day_based/employees?${range}`,
    ),
    apiGet<{ employee_groups: { id: number; name: string }[] }>(
      location,
      (dep) => `${PEOPLE_API}/scheduling/departments/${dep}/day_based/employee_groups?${range}`,
    ),
  ]);
  const employeeName = new Map(employees.map((e) => [e.id, e.display_name.trim()]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  return shifts
    .map((s) => ({
      date: s.date,
      name: s.employee_id ? (employeeName.get(s.employee_id) ?? 'Ukjent') : null,
      group: s.employee_group_id ? (groupName.get(s.employee_group_id) ?? null) : null,
      start: s.start_time,
      end: s.end_time,
      status: s.status,
      punchIn: s.punch_in_date_time?.slice(11, 16) ?? null,
      punchOut: s.punch_out_date_time?.slice(11, 16) ?? null,
    }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || (a.name ?? '').localeCompare(b.name ?? ''),
    );
}
