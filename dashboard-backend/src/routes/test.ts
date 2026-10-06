import { Router } from 'express';
import { getServiceAData } from '../services/serviceA';
import { todayInNorway } from '../utils/norway';

const router = Router();

// First milestone: log in to one website and return one value.
router.get('/', async (_req, res) => {
  try {
    const data = await getServiceAData(todayInNorway());
    res.json({ success: true, value: data });
  } catch (err) {
    console.error('[test] Service A failed:', err);
    res.status(502).json({ error: 'Failed to retrieve Service A data' });
  }
});

export default router;
