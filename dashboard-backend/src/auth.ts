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

const router = Router();

// POST /api/login { password } → { token, demo }
router.post('/', (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const kind =
    config.appPassword && sameSecret(password, config.appPassword)
      ? 'real'
      : config.demoPassword && sameSecret(password, config.demoPassword)
        ? 'demo'
        : null;
  if (!kind) {
    res.status(401).json({ error: 'Wrong password' });
    return;
  }
  res.json({ token: makeToken(kind), demo: kind === 'demo' });
});

export default router;
