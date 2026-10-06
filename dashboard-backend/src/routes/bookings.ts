import { Router } from 'express';
import { cached, wantsFresh } from '../cache/cache';
import { config } from '../config';
import { findNextBookingDay, getBookings, getUpcomingBookingDays } from '../services/funbutler';
import { isValidDate, locationOf } from '../utils/norway';
import { DEMO_LOCATIONS, demoBookings, demoUpcoming } from '../services/demo';

const router = Router();

// GET /api/bookings/next?from=YYYY-MM-DD → { date: "YYYY-MM-DD" | null }
// The first day on or after `from` (within 90 days) that has bookings.
router.get('/next', async (req, res) => {
  const { from } = req.query;
  if (!isValidDate(from)) {
    res.status(400).json({ error: 'Query parameter "from" must be a valid date in YYYY-MM-DD format' });
    return;
  }
  if (DEMO_LOCATIONS.has(locationOf(req.query))) {
    res.json({ date: demoUpcoming(from, 1)[0]?.date ?? null, demo: true });
    return;
  }

  try {
    const date = await cached(`next-booking:${from}`, config.cacheTtlMs, () => findNextBookingDay(from), wantsFresh(req.query));
    res.json({ date });
  } catch (err) {
    console.error('[bookings] FunButler next-day search failed:', err);
    res.status(502).json({ error: 'Failed to find the next FunButler booking day' });
  }
});

// GET /api/bookings/upcoming?from=YYYY-MM-DD&count=10 → { days: [{ date, bookings }] }
// The next `count` days (1–30, default 10) on or after `from`, within 90 days, that have bookings.
// Fewer than `count` days back means there are no more in that window.
router.get('/upcoming', async (req, res) => {
  const { from } = req.query;
  if (!isValidDate(from)) {
    res.status(400).json({ error: 'Query parameter "from" must be a valid date in YYYY-MM-DD format' });
    return;
  }
  const count = Math.min(30, Math.max(1, Number(req.query.count) || 10));
  if (DEMO_LOCATIONS.has(locationOf(req.query))) {
    res.json({ days: demoUpcoming(from, count), demo: true });
    return;
  }

  try {
    const days = await cached(
      `upcoming-bookings:${from}:${count}`,
      config.cacheTtlMs,
      () => getUpcomingBookingDays(from, count),
      wantsFresh(req.query),
    );
    res.json({ days });
  } catch (err) {
    console.error('[bookings] FunButler upcoming search failed:', err);
    res.status(502).json({ error: 'Failed to retrieve upcoming FunButler bookings' });
  }
});

// GET /api/bookings?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { date } = req.query;
  if (!isValidDate(date)) {
    res.status(400).json({ error: 'Query parameter "date" must be a valid date in YYYY-MM-DD format' });
    return;
  }
  if (DEMO_LOCATIONS.has(locationOf(req.query))) {
    res.json({ date, bookings: demoBookings(date), demo: true });
    return;
  }

  try {
    res.json(await cached(`bookings:${date}`, config.cacheTtlMs, () => getBookings(date), wantsFresh(req.query)));
  } catch (err) {
    console.error('[bookings] FunButler failed:', err);
    res.status(502).json({ error: 'Failed to retrieve FunButler bookings' });
  }
});

export default router;
