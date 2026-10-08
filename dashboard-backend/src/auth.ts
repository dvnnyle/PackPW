import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { config } from './config';

// App login: one shared password. APP_PASSWORD gives real data, DEMO_PASSWORD demo data only (for Google's
// reviewers and outside testers). The app gets a token signed with that password, so changing a password on
// Render logs out every phone that used it.
const TOKEN_DAYS = 90;

export type Session = { demo: boolean };

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('base64url');

function secretFor(kind: string): string {
  return kind === 'demo' ? config.demoPassword : kind === 'real' ? config.appPassword : '';
}

// Token: "<real|demo>.<expiry ms>.<signature>".
function makeToken(kind: 'real' | 'demo'): string {
  const body = `${kind}.${Date.now() + TOKEN_DAYS * 86_400_000}`;
  return `${body}.${sign(secretFor(kind), body)}`;
}

export function verifyToken(token: string): Session | null {
  const [kind, expires, signature] = token.split('.');
  const secret = secretFor(kind);
  if (!secret || !signature || Number(expires) < Date.now()) return null;
  return sameSecret(signature, sign(secret, `${kind}.${expires}`)) ? { demo: kind === 'demo' } : null;
}

// Wrong passwords per IP: after 10 in 15 minutes, logins from that IP are refused until the window ends.
// ponytail: in-memory, resets on restart; fine for one small instance.
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60_000;

const router = Router();

// POST /api/login { password } → { token, demo }
router.post('/', (req, res) => {
  const ip = req.ip ?? '';
  const now = Date.now();
  const f = failures.get(ip);
  if (f && f.until > now && f.count >= MAX_FAILURES) {
    res.status(429).json({ error: 'Too many attempts, try again later' });
    return;
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const kind =
    config.appPassword && sameSecret(password, config.appPassword)
      ? 'real'
      : config.demoPassword && sameSecret(password, config.demoPassword)
        ? 'demo'
        : null;
  if (!kind) {
    failures.set(ip, { count: f && f.until > now ? f.count + 1 : 1, until: f && f.until > now ? f.until : now + WINDOW_MS });
    res.status(401).json({ error: 'Wrong password' });
    return;
  }
  failures.delete(ip);
  res.json({ token: makeToken(kind), demo: kind === 'demo' });
});

export default router;
