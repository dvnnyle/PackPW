import fs from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import cors from 'cors';
import { config } from './config';
import { closeBrowser } from './browser/browser';
import bookingsRouter from './routes/bookings';
import dashboardRouter from './routes/dashboard';
import salesRouter from './routes/sales';
import weatherRouter from './routes/weather';
import staffRouter from './routes/staff';
import appVersionRouter from './routes/appVersion';
import cronRouter from './routes/cron';
import loginRouter, { sameSecret, verifyToken } from './auth';
import pushRouter from './push';
import { getStaffWeek } from './services/planday';
import { getServiceAData } from './services/serviceA';
import { getServiceBData } from './services/serviceB';
import { todayInNorway } from './utils/norway';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});
app.use('/api/login', loginRouter);

// Privacy policy for the Google Play listing: public, outside the website login.
app.get('/personvern', (_req, res) => res.sendFile(path.resolve('public/personvern.html')));

// On the open internet (Render) the API returns sales figures and customer contact details, so it requires
// the app login (Bearer token, the same on the phone and the website) or the old app API key. Locally, with no API_KEY set, it stays
// open for development. Demo logins only get demo data, and only on the app's data routes.
const DEMO_ROUTES = /^\/(dashboard|sales|bookings|staff|weather|app-version)(\/|$)/;
const requireApiKey: RequestHandler = (req, res, next) => {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  const session = scheme === 'Bearer' && token ? verifyToken(token) : null;
  if (session && !session.demo) return next();
  if (session?.demo && DEMO_ROUTES.test(req.path)) {
    res.locals.demo = true;
    return next();
  }
  if (!config.apiKey) return next();
  const key = req.get('x-api-key') ?? '';
  if (sameSecret(key, config.apiKey)) return next();
  res.status(401).json({ error: 'Missing or invalid API key' });
};
app.use('/api', requireApiKey);

app.use('/api/bookings', bookingsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/sales', salesRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/staff', staffRouter);
app.use('/api/app-version', appVersionRouter);
app.use('/api/cron', cronRouter);
app.use('/api/push', pushRouter);

// The website (Expo web export in ./web, built on Render). The files themselves hold no data; like the phone app
// it shows the login screen, and every API call needs the login token.
const WEB_DIR = path.resolve('web');
if (fs.existsSync(WEB_DIR)) {
  app.use(express.static(WEB_DIR));
  // App routes like /bookinger and /statistikk all load the single-page app.
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api/') ? res.sendFile(path.join(WEB_DIR, 'index.html')) : next()));
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Log the real error on the server; never send internals to the client.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`Backend running at http://localhost:${config.port}`);
  // Log in to every service in the background so the first app request doesn't wait for a browser login.
  const today = todayInNorway();
  const warmUps: [string, Promise<unknown>][] = [
    ['Wallmob', getServiceAData(today)],
    ['NordPay', getServiceBData(today)],
    ['Planday', getStaffWeek(today)],
  ];
  for (const [name, warmUp] of warmUps) {
    warmUp.catch((err) => console.error(`[startup] ${name} warm-up failed:`, err.message));
  }

  // Keep today's data fresh by calling our own warmup endpoint on a timer (no external cron needed).
  if (config.warmupMinutes > 0) {
    setInterval(() => {
      fetch(`http://127.0.0.1:${config.port}/api/cron/warmup`, {
        headers: config.apiKey ? { 'x-api-key': config.apiKey } : undefined,
      }).catch((err) => console.error('[warmup] Scheduled refresh failed:', err.message));
    }, config.warmupMinutes * 60_000);
  }

  // Today's sales for Oversikt and Statistikk are refreshed together every minute (fresh=1 updates the cache),
  // so the two pages show the same totals instead of drifting apart between their separate cache refreshes.
  if (config.liveRefreshSeconds > 0) {
    setInterval(() => {
      const today = todayInNorway();
      const headers = config.apiKey ? { 'x-api-key': config.apiKey } : undefined;
      for (const path of [`/api/dashboard?date=${today}`, `/api/sales/hourly?date=${today}`]) {
        fetch(`http://127.0.0.1:${config.port}${path}&fresh=1`, { headers }).catch((err) =>
          console.error('[live] Refresh of today failed:', err.message),
        );
      }
    }, config.liveRefreshSeconds * 1000);
  }
});

async function shutdown() {
  server.close();
  await closeBrowser();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
