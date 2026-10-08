// Demo data for locations that aren't connected yet (Triaden, until its credentials are in place).
// Numbers are made up but stable: the same date always gives the same figures, and Oversikt's totals equal the
// sum of Statistikk's hours. Remove a location from DEMO_LOCATIONS once its real logins are configured.
import type { Booking, DashboardData, HourlySalesData, StaffShift } from '../types';
import type { Request, Response } from 'express';
import { locationOf, openingHours, todayInNorway } from '../utils/norway';

export const DEMO_LOCATIONS = new Set(['triaden']);

// Demo data for this request: a demo location, or any location for a demo login or DEMO_API_KEY (the Google Play
// app, which anyone can install, so those must never reach real sales or customer data).
export function isDemo(req: Request, res: Response): boolean {
  return res.locals.demo === true || DEMO_LOCATIONS.has(locationOf(req.query));
}

// Small seeded random generator so a date always produces the same demo values.
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, list: T[]) => list[Math.floor(r() * list.length)];
const round = (n: number) => Math.round(n * 100) / 100;

const FIRST = ['Emma', 'Noah', 'Ella', 'Oliver', 'Nora', 'Lucas', 'Sofie', 'Filip', 'Maja', 'Jakob', 'Ingrid', 'Aksel'];
const LAST = ['Hansen', 'Johansen', 'Olsen', 'Larsen', 'Andersen', 'Pedersen', 'Nilsen', 'Berg', 'Haugen', 'Dahl'];
const PACKAGES = ['Fiestarommet + Lek', 'Extremerommet + Lek', 'Fiestarommet + All Inclusive', 'Spiseområdet - LEK + Minigolf'];
const GROUPS = ['Resepsjon', 'Kjøkken', 'Kontor', 'Vakt'];

// Is `date` in the past, today or the future, and which hours have "happened" yet.
function hoursSoFar(date: string, open: number, close: number): number {
  const today = todayInNorway();
  if (date > today) return open;
  if (date < today) return close;
  const now = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return Math.min(close, Math.max(open, now + 1));
}

export function demoHourly(date: string, loc = 'triaden'): HourlySalesData {
  const r = rng(`${loc}:hourly:${date}`);
  const { open, close } = openingHours(date);
  const weekend = close === 19;
  const until = hoursSoFar(date, open, close);
  const hours = [];
  for (let h = open; h < close; h++) {
    const happened = h < until;
    // Busier around midday and in the afternoon, and at weekends.
    const curve = 0.5 + Math.sin(((h - open) / (close - open)) * Math.PI) * (weekend ? 1.6 : 1);
    hours.push({
      hour: h,
      extandaGo: happened ? round(curve * (900 + r() * 1800)) : 0,
      nordpay: happened ? Math.round(curve * (r() * 1400)) : 0,
    });
  }
  const extanda = hours.reduce((s, h) => s + h.extandaGo, 0);
  const names = ['Mia Strand', 'Henrik Moe', 'Sara Lie', 'Tobias Holm', 'Julie Aas'];
  let left = extanda;
  const topSellers = names.slice(0, extanda > 0 ? 3 + Math.floor(r() * 3) : 0).map((name, i, all) => {
    const share = i === all.length - 1 ? left : round(left * (0.35 + r() * 0.2));
    left = round(left - share);
    return { name, revenue: share };
  });
  topSellers.sort((a, b) => b.revenue - a.revenue);
  return { date, updatedAt: new Date().toISOString(), openHour: open, closeHour: close, hours, topSellers, errors: [] };
}

export function demoDashboard(date: string, loc = 'triaden'): DashboardData {
  const hourly = demoHourly(date, loc);
  const r = rng(`${loc}:dashboard:${date}`);
  const revenue = round(hourly.hours.reduce((s, h) => s + (h.extandaGo ?? 0), 0));
  const nordpay = hourly.hours.reduce((s, h) => s + (h.nordpay ?? 0), 0);
  const lastYear = round(revenue * (0.7 + r() * 0.6) || 8000 + r() * 6000);
  const bookings = demoBookings(date, loc);
  return {
    date,
    updatedAt: hourly.updatedAt,
    serviceA: {
      revenueToday: revenue,
      revenueLastYearSameWeekday: lastYear,
      revenueChangePercent: lastYear ? ((revenue - lastYear) / lastYear) * 100 : null,
      productsSoldToday: Math.round(revenue / 95),
      grossMarginPercent: 88 + Math.round(r() * 6),
      customersToday: Math.round(revenue / 180),
    },
    serviceB: { salesToday: nordpay, ordersToday: Math.round(nordpay / 300) },
    today: { date, bookings, bookingCount: bookings.length, guestCount: bookings.reduce((s, b) => s + b.guests, 0) },
    errors: [],
  };
}

export function demoBookings(date: string, loc = 'triaden'): Booking[] {
  const r = rng(`${loc}:bookings:${date}`);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const count = weekday === 0 || weekday === 6 ? 2 + Math.floor(r() * 3) : r() < 0.4 ? 1 : 0;
  const times = ['11:00', '12:30', '14:00', '15:30', '17:00'];
  return Array.from({ length: count }, (_, i) => {
    const name = pick(r, PACKAGES);
    const guests = 8 + Math.floor(r() * 12);
    const unit = 229 + Math.floor(r() * 4) * 25;
    const child = pick(r, FIRST);
    const first = pick(r, FIRST);
    const start = times[i];
    const end = `${String(Number(start.slice(0, 2)) + 2).padStart(2, '0')}:${start.slice(3)}`;
    const orderRows = [
      { name: `${name} (${start}-${end})`, quantity: guests, unitPrice: unit, total: guests * unit },
      { name: 'Pizza med ost', quantity: guests, unitPrice: 15, total: guests * 15 },
    ];
    return {
      bookingNumber: 9000 + Number(date.replace(/-/g, '').slice(-4)) * 10 + i,
      time: start,
      endTime: end,
      name,
      guests,
      birthdayChildren: [{ name: child, age: 4 + Math.floor(r() * 7), birthDate: null }],
      price: orderRows.reduce((s, o) => s + o.total, 0),
      customerName: first,
      customer: { firstName: first, lastName: pick(r, LAST), phone: '+47 000 00 000', email: 'demo@example.com' },
      createdAt: null,
      orderRows,
      paid: r() < 0.3,
      staffComment: null,
    };
  });
}

export function demoUpcoming(from: string, count: number, loc = 'triaden'): { date: string; bookings: Booking[] }[] {
  const days = [];
  for (let i = 0; i < 90 && days.length < count; i++) {
    const d = new Date(`${from}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    const bookings = demoBookings(date, loc);
    if (bookings.length) days.push({ date, bookings });
  }
  return days;
}

export function demoStaff(date: string, loc = 'triaden'): StaffShift[] {
  const r = rng(`${loc}:staff:${date}`);
  const { open, close } = openingHours(date);
  const today = todayInNorway();
  const shifts = GROUPS.map((group, i) => {
    const start = i % 2 === 0 ? open : 15;
    const end = i % 2 === 0 ? Math.min(close, open + 7) : close;
    const past = date < today;
    return {
      date,
      name: `${pick(r, FIRST)} ${pick(r, LAST)}`,
      group,
      start: `${String(start).padStart(2, '0')}:00`,
      end: `${String(end).padStart(2, '0')}:00`,
      status: past ? 'PunchclockFinished' : 'Assigned',
      punchIn: past ? `${String(start).padStart(2, '0')}:0${Math.floor(r() * 5)}` : null,
      punchOut: past ? `${String(end).padStart(2, '0')}:0${Math.floor(r() * 9)}` : null,
    };
  });
  return shifts.sort((a, b) => a.start.localeCompare(b.start));
}
