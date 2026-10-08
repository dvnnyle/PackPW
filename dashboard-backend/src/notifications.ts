import { config } from './config';
import { sendPush } from './push';
import type { DashboardData } from './types';
import { openingHours, todayInNorway } from './utils/norway';

// The staff notifications for Playworld Sørlandet, checked once a minute (Norwegian time):
// - at opening time: how many bookings there are today
// - every full hour while open: total sales so far today (Extanda Go + NordPay)
// - 10 minutes after closing: the day's final total (a little later, so the last sales have reached the reports)
const CLOSING_DELAY_MIN = 10;

function osloClock(): { hour: number; minute: number } {
  const [hour, minute] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date())
    .split(':')
    .map(Number);
  return { hour, minute };
}

// "12 447,00 kr"
const kroner = (n: number) => `${new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} kr`;

// Today's dashboard from our own API (the same cached numbers Oversikt shows; `fresh` fetches new ones).
async function todaysDashboard(fresh: boolean): Promise<DashboardData> {
  const response = await fetch(
    `http://127.0.0.1:${config.port}/api/dashboard?date=${todayInNorway()}${fresh ? '&fresh=1' : ''}`,
    { headers: config.apiKey ? { 'x-api-key': config.apiKey } : undefined },
  );
  if (!response.ok) throw new Error(`Dashboard returned ${response.status}`);
  return (await response.json()) as DashboardData;
}

const totalSales = (d: DashboardData) => (d.serviceA?.revenueToday ?? 0) + (d.serviceB?.salesToday ?? 0);

export function bookingsText(count: number, guests: number): string {
  if (count === 0) return 'Ingen bookinger i dag';
  return `Vi har ${count} ${count === 1 ? 'booking' : 'bookinger'} i dag · ${guests} gjester`;
}

// Which notification (if any) is due at this minute.
export function dueNotification(date: string, hour: number, minute: number): 'bookings' | 'hourly' | 'closing' | null {
  const { open, close } = openingHours(date);
  if (hour === open && minute === 0) return 'bookings';
  if (hour > open && hour < close && minute === 0) return 'hourly';
  if (hour === close && minute === CLOSING_DELAY_MIN) return 'closing';
  return null;
}

async function sendDue() {
  const date = todayInNorway();
  const { hour, minute } = osloClock();
  const due = dueNotification(date, hour, minute);
  if (!due) return;
  const data = await todaysDashboard(due === 'closing');
  if (due === 'bookings') {
    await sendPush('God morgen! ☀️', bookingsText(data.today?.bookingCount ?? 0, data.today?.guestCount ?? 0));
  } else if (due === 'hourly') {
    await sendPush('Playworld Sørlandet', `Totalt salg i dag: ${kroner(totalSales(data))}`);
  } else {
    await sendPush('Stengt for i dag', `Totalt salg i dag: ${kroner(totalSales(data))}`);
  }
  console.log(`[notifications] Sent ${due} (${date} ${hour}:${String(minute).padStart(2, '0')})`);
}

let lastMinute = '';
export function startNotificationSchedule() {
  setInterval(() => {
    // Once per minute, even if the timer fires twice within the same minute.
    const { hour, minute } = osloClock();
    const key = `${todayInNorway()} ${hour}:${minute}`;
    if (key === lastMinute) return;
    lastMinute = key;
    sendDue().catch((err) => console.error('[notifications] Failed:', (err as Error).message));
  }, 20_000);
}
