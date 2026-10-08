import { Router } from 'express';
import { hasLogins } from '../config';
import { cached, ttlForDate, wantsFresh } from '../cache/cache';
import { getServiceAData } from '../services/serviceA';
import { getServiceBData } from '../services/serviceB';
import { getBookings } from '../services/funbutler';
import type { DashboardData } from '../types';
import { isValidDate, locationOf, todayInNorway } from '../utils/norway';

const router = Router();

async function buildDashboard(date: string, location: string): Promise<DashboardData> {
  const [serviceA, serviceB, bookings] = await Promise.allSettled([
    getServiceAData(date, location),
    getServiceBData(date, location),
    getBookings(date, location),
  ]);

  const errors: string[] = [];
  function unwrap<T>(result: PromiseSettledResult<T>, label: string): T | null {
    if (result.status === 'fulfilled') return result.value;
    console.error(`[dashboard] ${label} failed:`, result.reason);
    errors.push(`Failed to retrieve ${label} data`);
    return null;
  }

  const bookingData = unwrap(bookings, 'FunButler');
  return {
    date,
    updatedAt: new Date().toISOString(),
    serviceA: unwrap(serviceA, 'Wallmob'),
    serviceB: unwrap(serviceB, 'NordPay'),
    today: bookingData
      ? {
          ...bookingData,
          bookingCount: bookingData.bookings.length,
          guestCount: bookingData.bookings.reduce((sum, b) => sum + b.guests, 0),
        }
      : null,
    errors,
  };
}

// GET /api/dashboard?date=YYYY-MM-DD (optional, defaults to today in Norway)
router.get('/', async (req, res) => {
  const date = req.query.date ?? todayInNorway();
  if (!isValidDate(date)) {
    res.status(400).json({ error: 'Query parameter "date" must be a valid date in YYYY-MM-DD format' });
    return;
  }
  const location = locationOf(req.query);
  if (!hasLogins(location)) {
    res.status(404).json({ error: 'Location not connected yet' });
    return;
  }
  res.json(
    await cached(`dashboard:${location}:${date}`, ttlForDate(date), () => buildDashboard(date, location), wantsFresh(req.query)),
  );
});

export default router;
