import { Router } from 'express';
import { cached } from '../cache/cache';
import { getWeather } from '../services/weather';

const router = Router();

// GET /api/weather → current weather and the next 12 hours at Playworld Sørlandet.
router.get('/', async (_req, res) => {
  try {
    res.json(await cached('weather', 10 * 60_000, getWeather));
  } catch (err) {
    console.error('[weather] MET failed:', err);
    res.status(502).json({ error: 'Failed to retrieve weather' });
  }
});

export default router;
