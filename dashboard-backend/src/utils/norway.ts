// Today's date in Norway (YYYY-MM-DD), even when the server runs in UTC (e.g. on Render).
export function todayInNorway(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
}

// Unix time (seconds) of midnight in Norway at the start of `date` (YYYY-MM-DD).
// ponytail: on the two DST-change days the hours after 02:00 shift by one; fine for an hourly chart.
export function norwayMidnight(date: string): number {
  const utcMidnight = Date.parse(`${date}T00:00:00Z`);
  const osloHour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: 'numeric', hourCycle: 'h23' }).format(utcMidnight),
  );
  return (utcMidnight - osloHour * 3_600_000) / 1000;
}

// True for a real calendar date in YYYY-MM-DD format.
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// Opening hours: 10–21 Monday–Friday, 10–19 on weekends.
export function openingHours(date: string): { open: number; close: number } {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { open: 10, close: weekday === 0 || weekday === 6 ? 19 : 21 };
}

// The location a request asks for (?location=…), defaulting to Sørlandet.
export function locationOf(query: Record<string, unknown>): string {
  return typeof query.location === 'string' && query.location ? query.location : 'sorlandet';
}
