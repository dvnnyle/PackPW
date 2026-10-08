import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { config } from './config';

// App and website login: one shared password (APP_PASSWORD). The app gets a token signed with that password, so
// changing it on Render logs out every phone and browser.
const TOKEN_DAYS = 90;

// Constant-time comparison, so response timing doesn't reveal how much of a secret was right.
export function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const sign = (body: string) => createHmac('sha256', config.appPassword).update(body).digest('base64url');

// Token: "real.<expiry ms>.<signature>" (the "real" prefix keeps tokens from earlier versions valid).
function makeToken(): string {
  const body = `real.${Date.now() + TOKEN_DAYS * 86_400_000}`;
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string): boolean {
  const [kind, expires, signature] = token.split('.');
  if (!config.appPassword || kind !== 'real' || !signature || Number(expires) < Date.now()) return false;
  return sameSecret(signature, sign(`${kind}.${expires}`));
}

const router = Router();

// POST /api/login { password } → { token }
router.post('/', (req, res) => {
  // Local development (no password, no API key): the API is open anyway, so any password logs in.
  if (!config.appPassword && !config.apiKey) {
    res.json({ token: 'dev' });
    return;
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!config.appPassword || !sameSecret(password, config.appPassword)) {
    res.status(401).json({ error: 'Wrong password' });
    return;
  }
  res.json({ token: makeToken() });
});

export default router;
