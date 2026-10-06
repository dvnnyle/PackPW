// FunButler bookings.
// FunButler's calendar loads structured JSON from its own API, so we call that directly
// instead of driving a browser: POST /api/authenticate sets an "access-token" cookie,
// then GET /api/client/{clientId}/bookings/by-day/{date} returns that day's bookings.
import { requireEnv } from '../config';
import type { BirthdayChild, Booking, BookingsResult } from '../types';

interface Session {
  cookie: string;
  clientId: string;
}

interface RawBooking {
  bookingNumber: number;
  localDay: string;
  localStartTime: string;
  localEndTime: string;
  persons: number;
  packages?: { name?: string }[];
  orderRows?: { name?: string; quantity?: number; unitPrice?: { withVat?: number } }[];
  birthdayInfo?: { persons?: { name?: string; birthDate?: string }[] };
  price?: { withVat?: number };
  customer?: { firstName?: string; lastName?: string; phone?: string; email?: string };
  created?: string;
  staffComment?: string;
  paymentInfo?: unknown[];
}

let session: Session | null = null;

function baseUrl(): string {
  return requireEnv('FUNBUTLER_URL').replace(/\/$/, '');
}

async function login(): Promise<Session> {
  const response = await fetch(`${baseUrl()}/api/authenticate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      username: requireEnv('FUNBUTLER_USERNAME'),
      password: requireEnv('FUNBUTLER_PASSWORD'),
    }),
  });
  const body = (await response.json().catch(() => null)) as { succeeded?: boolean; clientId?: string } | null;
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

  if (!response.ok || !body?.succeeded || !body.clientId || !cookie) {
    throw new Error(`FunButler login failed (HTTP ${response.status})`);
  }
  return { cookie, clientId: body.clientId };
}

// Calls the API with the current session; logs in again once if the session has expired.
async function apiGet<T>(path: (clientId: string) => string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    session ??= await login();
    const response = await fetch(`${baseUrl()}${path(session.clientId)}`, {
      headers: { accept: 'application/json', cookie: session.cookie },
    });
    if (response.status === 401 && attempt === 0) {
      session = null;
      continue;
    }
    if (!response.ok) {
      throw new Error(`FunButler request failed (HTTP ${response.status})`);
    }
    return (await response.json()) as T;
  }
  throw new Error('FunButler request failed: not authorized after logging in again');
}

// FunButler shows the age the child turns this year (booking year minus birth year).
function birthdayChild(name: string, birthDate: string | undefined, bookingDay: string): BirthdayChild {
  const birthYear = birthDate ? Number(birthDate.slice(0, 4)) : NaN;
  const age = Number(bookingDay.slice(0, 4)) - birthYear;
  return { name, age: Number.isFinite(age) ? age : null, birthDate: birthDate?.slice(0, 10) ?? null };
}

function normalize(raw: RawBooking): Booking {
  const name =
    raw.packages?.[0]?.name ?? raw.orderRows?.[0]?.name?.replace(/\s*\(.*\)$/, '') ?? 'Booking';
  return {
    bookingNumber: raw.bookingNumber,
    time: raw.localStartTime,
    endTime: raw.localEndTime,
    name,
    guests: raw.persons,
    birthdayChildren: (raw.birthdayInfo?.persons ?? [])
      .filter((p) => p.name)
      .map((p) => birthdayChild(p.name!, p.birthDate, raw.localDay)),
    price: raw.price?.withVat ?? null,
    // Details for the booking modal (FunButler's "Oversikt" and "Mer info" tabs).
    customerName: raw.customer?.firstName?.trim() || null,
    customer: {
      firstName: raw.customer?.firstName?.trim() || null,
      lastName: raw.customer?.lastName?.trim() || null,
      phone: raw.customer?.phone?.trim() || null,
      email: raw.customer?.email?.trim() || null,
    },
    createdAt: raw.created ?? null,
    orderRows: (raw.orderRows ?? []).map((row) => {
      const quantity = row.quantity ?? 0;
      const unitPrice = row.unitPrice?.withVat ?? 0;
      return { name: row.name ?? '', quantity, unitPrice, total: quantity * unitPrice };
    }),
    paid: (raw.paymentInfo?.length ?? 0) > 0,
    staffComment: raw.staffComment?.trim() || null,
  };
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Finds the first day on or after `fromDate` that has bookings, checking a week at a time.
export async function findNextBookingDay(fromDate: string, maxDays = 90): Promise<string | null> {
  const BATCH = 7;
  for (let offset = 0; offset < maxDays; offset += BATCH) {
    const days = Array.from({ length: Math.min(BATCH, maxDays - offset) }, (_, i) => addDays(fromDate, offset + i));
    const counts = await Promise.all(
      days.map((day) =>
        apiGet<unknown[]>((clientId) => `/api/client/${clientId}/bookings/by-day/${day}`).then((list) => list.length),
      ),
    );
    const index = counts.findIndex((count) => count > 0);
    if (index !== -1) return days[index];
  }
  return null;
}

// The first `count` days on or after `fromDate` (within `maxDays`) that have bookings, checking a week at a time.
export async function getUpcomingBookingDays(fromDate: string, count = 10, maxDays = 90): Promise<BookingsResult[]> {
  const BATCH = 7;
  const found: BookingsResult[] = [];
  for (let offset = 0; offset < maxDays && found.length < count; offset += BATCH) {
    const days = Array.from({ length: Math.min(BATCH, maxDays - offset) }, (_, i) => addDays(fromDate, offset + i));
    const results = await Promise.all(days.map(getBookings));
    found.push(...results.filter((r) => r.bookings.length > 0));
  }
  return found.slice(0, count);
}

export async function getBookings(date: string): Promise<BookingsResult> {
  const raw = await apiGet<RawBooking[]>((clientId) => `/api/client/${clientId}/bookings/by-day/${date}`);
  const bookings = raw.map(normalize).sort((a, b) => a.time.localeCompare(b.time));
  return { date, bookings };
}
