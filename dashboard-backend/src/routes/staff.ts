import { Router } from 'express';
import { cached, wantsFresh } from '../cache/cache';
import { config } from '../config';
import { getStaffWeek, weekOf } from '../services/planday';
import { isValidDate, todayInNorway } from '../utils/norway';

const router = Router();

// GET /api/staff?date=YYYY-MM-DD (optional, defaults to today) → { date, shifts } from Planday.
router.get('/', async (req, res) => {
  const date = req.query.date ?? todayInNorway();
  if (!isValidDate(date)) {
    res.status(400).json({ error: 'Query parameter "date" must be a valid date in YYYY-MM-DD format' });
    return;
  }
  try {
    // One fetch covers the whole week, so other days in it come straight from the cache.
    const week = await cached(`staff-week:${weekOf(date).monday}`, config.cacheTtlMs, () => getStaffWeek(date), wantsFresh(req.query));
    res.json({ date, shifts: week.filter((s) => s.date === date) });
  } catch (err) {
    console.error('[staff] Planday failed:', err);
    res.status(502).json({ error: 'Failed to retrieve Planday schedule' });
  }
});

export default router;
