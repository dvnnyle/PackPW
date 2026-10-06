import { Router } from 'express';
import { cached } from '../cache/cache';
import { getWeather } from '../services/weather';
import { locationOf } from '../utils/norway';

const router = Router();

// GET /api/weather → current weather and the next 12 hours at Playworld Sørlandet.
router.get('/', async (req, res) => {
  const location = locationOf(req.query);
  try {
    res.json(await cached(`weather:${location}`, 10 * 60_000, () => getWeather(location)));
  } catch (err) {
    console.error('[weather] MET failed:', err);
    res.status(502).json({ error: 'Failed to retrieve weather' });
  }
});

export default router;
