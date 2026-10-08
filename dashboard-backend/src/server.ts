import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import cors from 'cors';
import { config } from './config';
import { closeBrowser } from './browser/browser';
import testRouter from './routes/test';
import bookingsRouter from './routes/bookings';
import dashboardRouter from './routes/dashboard';
import salesRouter from './routes/sales';
import weatherRouter from './routes/weather';
import staffRouter from './routes/staff';
import appVersionRouter from './routes/appVersion';
import cronRouter from './routes/cron';
import loginRouter, { verifyToken } from './auth';
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

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The website's login: the browser's own username/password box (HTTP Basic Auth). After logging in, the browser
// sends it with every request to this address, including the website's own API calls.
function webLoginOk(req: express.Request): boolean {
  if (!config.webPassword) return false;
  const [scheme, encoded] = (req.get('authorization') ?? '').split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const [user, ...rest] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
  return sameSecret(user, config.webUser) && sameSecret(rest.join(':'), config.webPassword);
}

// On the open internet (Render) the API returns sales figures and customer contact details, so it requires
// the app login (Bearer token), the app's API key or the website login. Locally, with no API_KEY set, it stays
// open for development. Demo logins and the demo key only get demo data, and only on the app's data routes.
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
  if (sameSecret(key, config.apiKey) || webLoginOk(req)) return next();
  // The Play build's key: demo data only, and only on the app's data routes (not /api/test or /api/cron).
  if (config.demoApiKey && sameSecret(key, config.demoApiKey) && DEMO_ROUTES.test(req.path)) {
    res.locals.demo = true;
    return next();
  }
  res.status(401).json({ error: 'Missing or invalid API key' });
};
app.use('/api', requireApiKey);

app.use('/api/test', testRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/sales', salesRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/staff', staffRouter);
app.use('/api/app-version', appVersionRouter);
app.use('/api/cron', cronRouter);

// The website (Expo web export in ./web, built on Render), behind the browser login. Not served at all
// without WEB_PASSWORD, so it can never go online unprotected.
const WEB_DIR = path.resolve('web');
if (fs.existsSync(WEB_DIR) && config.webPassword) {
  app.use((req, res, next) => {
    if (webLoginOk(req)) return next();
    res.set('WWW-Authenticate', 'Basic realm="Playworld", charset="UTF-8"');
    res.status(401).send('Innlogging kreves');
  });
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
