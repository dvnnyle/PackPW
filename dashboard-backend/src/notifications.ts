import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { sendPush } from './push';
import { getBookings } from './services/funbutler';
import type { Booking, DashboardData, StaffShift } from './types';
import { openingHours } from './utils/norway';

// The staff notifications for Playworld Sørlandet, checked once a minute (Norwegian time). Each phone only gets the
// kinds it has switched on (Innstillinger → Varsler).
// Sales:     bookings count at opening · total every full hour · final total after closing ·
//            the week's total on Sunday after closing (Monday–Sunday)
// Bookings:  a new booking is made · a booking starts in 30 minutes
// Staff:     someone punches in / out · a shift has started but nobody punched in
// Weather:   rain expected tomorrow during opening hours
// Event-based notifications (punches, new bookings) remember what they've seen; the first check after a restart
// only records the current state, so a deploy never repeats something already sent.
const CLOSING_DELAY_MIN = 10;
const MISSING_PUNCH_AFTER_MIN = 10; // a shift counts as missed this long after its start…
const MISSING_PUNCH_UNTIL_MIN = 60; // …and is no longer reported after this
const BOOKING_SOON_MIN = 30;
const NEW_BOOKING_DAYS = 30; // days ahead scanned for new bookings
const NEW_BOOKING_EVERY_MIN = 10;
const RAIN_MM = 2; // tomorrow's rain during opening hours that's worth a heads-up

const DAYS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

function osloParts(when = new Date()): { date: string; hour: number; minute: number } {
  const [hour, minute] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(when)
    .split(':')
    .map(Number);
  return { date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(when), hour, minute };
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

// "lør 18. okt"
export function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
}

// "12 447,00 kr" / "12 447 kr"
const kroner = (n: number, decimals = 2) =>
  `${new Intl.NumberFormat('nb-NO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)} kr`;

// GET from our own API (the same cached data the app shows; `&fresh=1` in the path fetches new data).
async function ownApi<T>(apiPath: string): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${config.port}${apiPath}`, {
    headers: config.apiKey ? { 'x-api-key': config.apiKey } : undefined,
  });
  if (!response.ok) throw new Error(`${apiPath.split('?')[0]} returned ${response.status}`);
  return (await response.json()) as T;
}

const dashboard = (date: string, fresh = false) =>
  ownApi<DashboardData>(`/api/dashboard?date=${date}${fresh ? '&fresh=1' : ''}`);

const totalSales = (d: DashboardData) => (d.serviceA?.revenueToday ?? 0) + (d.serviceB?.salesToday ?? 0);

// ---------- texts (exported for notifications.check.ts) ----------

export function bookingsText(count: number, guests: number): string {
  if (count === 0) return '📭 Ingen bookinger i dag';
  return `🎉 Vi har ${count} ${count === 1 ? 'booking' : 'bookinger'} i dag · 👥 ${guests} gjester`;
}

const shiftInfo = (s: StaffShift) => `${s.group ? `${s.group} · ` : ''}vakt ${s.start}–${s.end}`;

export function punchInText(shift: StaffShift): { title: string; body: string } {
  return { title: `👋 ${shift.name} er på jobb`, body: `⏰ Stemplet inn ${shift.punchIn} · ${shiftInfo(shift)}` };
}

export function punchOutText(shift: StaffShift): { title: string; body: string } {
  return { title: `🏁 ${shift.name} har gått`, body: `⏰ Stemplet ut ${shift.punchOut} · ${shiftInfo(shift)}` };
}

export function missingPunchText(shift: StaffShift, minutesLate: number): { title: string; body: string } {
  return {
    title: `⚠️ ${shift.name} har ikke stemplet inn`,
    body: `${shiftInfo(shift)} · startet for ${minutesLate} min siden`,
  };
}

// No customer or child names: notifications show on the lock screen.
export function newBookingText(date: string, b: Booking): { title: string; body: string } {
  return { title: '🎈 Ny booking', body: `${dayLabel(date)} kl ${b.time} · 👥 ${b.guests} gjester · ${b.name}` };
}

export function bookingSoonText(b: Booking, minutes: number): { title: string; body: string } {
  const birthdays = b.birthdayChildren.length ? ` · 🎂 ${b.birthdayChildren.length} bursdagsbarn` : '';
  return { title: `⏰ Om ${minutes} min: ${b.name}`, body: `kl ${b.time}–${b.endTime} · 👥 ${b.guests} gjester${birthdays}` };
}

// "💰 Totalt 142 300 kr · man 6. okt – søn 12. okt"
export function weeklyText(total: number, monday: string, sunday: string): string {
  return `💰 Totalt ${kroner(total, 0)} · ${dayLabel(monday)} – ${dayLabel(sunday)}`;
}

export function rainText(mm: number, open: number, close: number): string {
  const amount = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 }).format(mm);
  return `☔ Ca. ${amount} mm regn i åpningstiden (${open}–${close}) – det kan bli travelt inne`;
}

// ---------- daily totals (for the weekly summary), kept next to the push tokens ----------

const HISTORY_FILE = path.join(
  path.dirname(path.resolve(process.env.PUSH_TOKENS_FILE ?? 'data/push-tokens.json')),
  'daily-totals.json',
);

function loadHistory(): Record<string, number> {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

const history = loadHistory();

function saveHistory() {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
  } catch (err) {
    console.error('[notifications] Could not save daily totals:', (err as Error).message);
  }
}

// A finished day's total, from the history or (once) from the dashboard. Days with fetch errors aren't stored.
async function dayTotal(date: string): Promise<number | null> {
  if (history[date] != null) return history[date];
  const d = await dashboard(date);
  if (!d.serviceA || !d.serviceB) return null;
  history[date] = totalSales(d);
  saveHistory();
  return history[date];
}

// ---------- scheduled notifications ----------

export type Scheduled = 'bookings' | 'hourly' | 'closing' | 'weekly' | 'weather';

// Which scheduled notifications are due at this minute.
export function dueNotifications(date: string, hour: number, minute: number): Scheduled[] {
  const { open, close } = openingHours(date);
  const due: Scheduled[] = [];
  if (hour === open && minute === 0) due.push('bookings');
  if (hour > open && hour < close && minute === 0) due.push('hourly');
  if (hour === close && minute === CLOSING_DELAY_MIN) due.push('closing');
  if (weekday(date) === 0 && hour === close && minute === CLOSING_DELAY_MIN + 5) due.push('weekly'); // after Sunday's closing
  if (hour === 18 && minute === 0) due.push('weather');
  return due;
}

async function sendScheduled(kind: Scheduled, date: string) {
  if (kind === 'bookings') {
    const d = await dashboard(date);
    await sendPush('God morgen! ☀️', bookingsText(d.today?.bookingCount ?? 0, d.today?.guestCount ?? 0), 'bookings');
  } else if (kind === 'hourly') {
    await sendPush('📈 Playworld Sørlandet', `💰 Totalt salg i dag: ${kroner(totalSales(await dashboard(date)))}`, 'hourly');
  } else if (kind === 'closing') {
    const d = await dashboard(date, true);
    await sendPush('🌙 Stengt for i dag', `💰 Totalt salg i dag: ${kroner(totalSales(d))}`, 'closing');
    if (d.serviceA && d.serviceB) {
      history[date] = totalSales(d);
      saveHistory();
    }
  } else if (kind === 'weekly') {
    // Monday–Sunday of the week that just ended (`date` is the Sunday; its total was stored at closing).
    const monday = addDays(date, -6);
    const totals = await Promise.all(Array.from({ length: 7 }, (_, i) => dayTotal(addDays(monday, i))));
    const total = totals.reduce<number>((a, b) => a + (b ?? 0), 0);
    await sendPush('📊 Uka er over', weeklyText(total, monday, date), 'weekly');
  } else if (kind === 'weather') {
    const tomorrow = addDays(date, 1);
    const { open, close } = openingHours(tomorrow);
    const { now, hours } = await ownApi<{ now: { time: string; precipitation: number }; hours: { time: string; precipitation: number }[] }>(
      '/api/weather',
    );
    const mm = [now, ...hours]
      .map((step) => ({ ...osloParts(new Date(step.time)), rain: step.precipitation ?? 0 }))
      .filter((step) => step.date === tomorrow && step.hour >= open && step.hour < close)
      .reduce((sum, step) => sum + step.rain, 0);
    if (mm < RAIN_MM) return;
    await sendPush('🌧️ Regn i morgen', rainText(mm, open, close), 'weather');
  }
  console.log(`[notifications] Sent ${kind} (${date})`);
}

// ---------- event-based notifications ----------

// What's been seen today; reset on a new day. `seeded` = the first check after a restart has run.
let day = { date: '', seeded: false, punchIn: new Set<string>(), punchOut: new Set<string>(), missing: new Set<string>(), soon: new Set<number>() };

function today(date: string) {
  if (day.date !== date) {
    day = { date, seeded: false, punchIn: new Set(), punchOut: new Set(), missing: new Set(), soon: new Set() };
  }
  return day;
}

const shiftKey = (s: StaffShift) => `${s.name}|${s.start}`;

async function checkStaff(date: string, now: number) {
  const d = today(date);
  const { shifts } = await ownApi<{ shifts: StaffShift[] }>(`/api/staff?date=${date}&fresh=1`);
  const named = shifts.filter((s) => s.name);
  const late = (s: StaffShift) => now - toMinutes(s.start);

  if (!d.seeded) {
    for (const s of named) {
      if (s.punchIn) d.punchIn.add(shiftKey(s));
      if (s.punchOut) d.punchOut.add(shiftKey(s));
      if (late(s) >= MISSING_PUNCH_AFTER_MIN) d.missing.add(shiftKey(s));
    }
    d.seeded = true;
    return;
  }

  for (const s of named) {
    const key = shiftKey(s);
    if (s.punchIn && !d.punchIn.has(key)) {
      d.punchIn.add(key);
      const { title, body } = punchInText(s);
      await sendPush(title, body, 'punchIn');
    }
    if (s.punchOut && !d.punchOut.has(key)) {
      d.punchOut.add(key);
      const { title, body } = punchOutText(s);
      await sendPush(title, body, 'punchOut');
    }
    const minutesLate = late(s);
    if (!s.punchIn && !d.missing.has(key) && minutesLate >= MISSING_PUNCH_AFTER_MIN && minutesLate < MISSING_PUNCH_UNTIL_MIN) {
      d.missing.add(key);
      const { title, body } = missingPunchText(s, minutesLate);
      await sendPush(title, body, 'missingPunch');
    }
  }
}

// Bookings starting in about 30 minutes (a 5-minute window, so a restart doesn't resend older ones).
async function checkBookingsSoon(date: string, now: number) {
  const d = today(date);
  const dash = await dashboard(date);
  for (const b of dash.today?.bookings ?? []) {
    const minutes = toMinutes(b.time) - now;
    if (minutes > BOOKING_SOON_MIN - 5 && minutes <= BOOKING_SOON_MIN && !d.soon.has(b.bookingNumber)) {
      d.soon.add(b.bookingNumber);
      const { title, body } = bookingSoonText(b, minutes);
      await sendPush(title, body, 'bookingSoon');
    }
  }
}

// New bookings: any booking in the next NEW_BOOKING_DAYS days that FunButler says was made after we started looking.
// (Checking the creation time means old bookings coming into the 30-day window aren't announced as new.)
const watchingSince = Date.now();
const announced = new Set<number>();

async function checkNewBookings(date: string) {
  for (let i = 0; i < NEW_BOOKING_DAYS; i++) {
    const bookingDate = addDays(date, i);
    const { bookings } = await getBookings(bookingDate);
    for (const b of bookings) {
      const created = b.createdAt ? Date.parse(b.createdAt) : NaN;
      if (!(created > watchingSince) || announced.has(b.bookingNumber)) continue;
      announced.add(b.bookingNumber);
      const { title, body } = newBookingText(bookingDate, b);
      await sendPush(title, body, 'newBooking');
    }
  }
}

// ---------- the minute loop ----------

const run = (label: string, task: Promise<unknown>) =>
  task.catch((err) => console.error(`[notifications] ${label} failed:`, (err as Error).message));

let lastMinute = '';
export function startNotificationSchedule() {
  setInterval(() => {
    const { date, hour, minute } = osloParts();
    const key = `${date} ${hour}:${minute}`;
    if (key === lastMinute) return; // once per minute, even if the timer fires twice within it
    lastMinute = key;
    const now = hour * 60 + minute;
    for (const kind of dueNotifications(date, hour, minute)) run(kind, sendScheduled(kind, date));
    if (hour >= 6 && hour <= 23) {
      run('Staff check', checkStaff(date, now));
      run('Booking soon check', checkBookingsSoon(date, now));
    }
    if (minute % NEW_BOOKING_EVERY_MIN === 0) run('New booking check', checkNewBookings(date));
  }, 20_000);
}
