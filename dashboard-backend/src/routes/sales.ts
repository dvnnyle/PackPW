import { Router } from 'express';
import { cached, ttlForDate, wantsFresh } from '../cache/cache';
import { getServiceAHourly, getServiceATopSellers } from '../services/serviceA';
import { getServiceBHourly } from '../services/serviceB';
import type { HourlySalesData } from '../types';
import { isValidDate, todayInNorway } from '../utils/norway';

const router = Router();

// Opening hours: 10–21 Monday–Friday, 10–19 on weekends.
function openingHours(date: string): { open: number; close: number } {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { open: 10, close: weekday === 0 || weekday === 6 ? 19 : 21 };
}

async function buildHourlySales(date: string): Promise<HourlySalesData> {
  const [extandaGo, nordpay, sellers] = await Promise.allSettled([
    getServiceAHourly(date),
    getServiceBHourly(date),
    getServiceATopSellers(date),
  ]);

  const errors: string[] = [];
  function unwrap(result: PromiseSettledResult<number[]>, label: string): number[] | null {
    if (result.status === 'fulfilled') return result.value;
    console.error(`[sales] ${label} hourly failed:`, result.reason);
    errors.push(`Failed to retrieve ${label} hourly sales`);
    return null;
  }
  const a = unwrap(extandaGo, 'Wallmob');
  const b = unwrap(nordpay, 'NordPay');

  // Show the opening hours, widened to include any sale made outside them.
  const { open, close } = openingHours(date);
  const hasSales = (h: number) => (a?.[h] ?? 0) > 0 || (b?.[h] ?? 0) > 0;
  let first = open;
  let last = close - 1;
  for (let h = 0; h < 24; h++) {
    if (hasSales(h)) {
      first = Math.min(first, h);
      last = Math.max(last, h);
    }
  }

  const hours = [];
  for (let h = first; h <= last; h++) {
    hours.push({ hour: h, extandaGo: a ? a[h] : null, nordpay: b ? b[h] : null });
  }
  const topSellers = sellers.status === 'fulfilled' ? sellers.value : null;
  if (sellers.status === 'rejected') console.error('[sales] Wallmob top sellers failed:', sellers.reason);
  return { date, updatedAt: new Date().toISOString(), openHour: open, closeHour: close, hours, topSellers, errors };
}

// GET /api/sales/hourly?date=YYYY-MM-DD (optional, defaults to today) → sales per hour for both locations.
router.get('/hourly', async (req, res) => {
  const date = req.query.date ?? todayInNorway();
  if (!isValidDate(date)) {
    res.status(400).json({ error: 'Query parameter "date" must be a valid date in YYYY-MM-DD format' });
    return;
  }
  res.json(await cached(`sales-hourly:${date}`, ttlForDate(date), () => buildHourlySales(date), wantsFresh(req.query)));
});

export default router;
