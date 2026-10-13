import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';

// Push notifications to the phone app through Expo's push service (which hands them to Google FCM).
// The app sends its Expo push token after every login/app start. Each phone has its own choice of which kinds of
// notification it wants (Innstillinger → Varsler); tokens and choices are kept in a JSON file.
// On Render, point PUSH_TOKENS_FILE at a persistent disk (e.g. /var/data/push-tokens.json) so they survive
// deploys; without one the list starts empty after a deploy and fills up again as phones open the app.
const TOKENS_FILE = path.resolve(process.env.PUSH_TOKENS_FILE ?? 'data/push-tokens.json');
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const TOKEN_PATTERN = /^Expo(nent)?PushToken\[[\w-]+\]$/;

// The kinds of notification (see notifications.ts). New phones get all of them.
export const KINDS = ['bookings', 'hourly', 'closing', 'punchIn'] as const;
export type Kind = (typeof KINDS)[number];
type Prefs = Record<Kind, boolean>;
const allOn = (): Prefs => Object.fromEntries(KINDS.map((k) => [k, true])) as Prefs;

// File format: { token: prefs }. Older files were a plain list of tokens; those phones get everything.
function load(): Map<string, Prefs> {
  try {
    const raw = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    if (Array.isArray(raw)) return new Map(raw.map((t: string) => [t, allOn()]));
    return new Map(Object.entries(raw as Record<string, Partial<Prefs>>).map(([t, p]) => [t, { ...allOn(), ...p }]));
  } catch {
    return new Map();
  }
}

const phones = load();

function save() {
  try {
    fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(Object.fromEntries(phones)));
  } catch (err) {
    console.error('[push] Could not save tokens:', (err as Error).message);
  }
}

// Sends one notification to every registered phone that wants this kind (no kind = everyone, e.g. the test).
// Tokens Expo reports as gone (app uninstalled) are dropped. Returns how many phones it was sent to.
export async function sendPush(title: string, body: string, kind?: Kind): Promise<number> {
  const all = [...phones].filter(([, prefs]) => !kind || prefs[kind]).map(([token]) => token);
  for (let i = 0; i < all.length; i += 100) {
    const batch = all.slice(i, i + 100);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      // priority high: delivered right away with sound, even when the phone is idle (Android "normal" can be held back).
      body: JSON.stringify(batch.map((to) => ({ to, title, body, channelId: 'varsler', sound: 'default', priority: 'high' }))),
    });
    if (!response.ok) throw new Error(`Expo push returned ${response.status}`);
    const { data } = (await response.json()) as {
      data: { status: string; id?: string; message?: string; details?: { error?: string } }[];
    };
    const ids = data.map((ticket) => ticket.id).filter((id): id is string => !!id);
    if (ids.length) setTimeout(() => logReceipts(ids).catch(() => {}), 15_000);
    data.forEach((ticket, j) => {
      if (ticket.status === 'ok') return;
      // Logged so problems (e.g. InvalidCredentials = FCM key missing in EAS) show up in the Render log.
      console.error(`[push] Expo rejected a message: ${ticket.details?.error ?? ''} ${ticket.message ?? ''}`);
      if (ticket.details?.error === 'DeviceNotRegistered') phones.delete(batch[j]);
    });
  }
  save();
  return all.length;
}

// A ticket only means Expo accepted the message; the receipt says whether Google (FCM) delivered it.
async function logReceipts(ids: string[]) {
  const response = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const { data } = (await response.json()) as {
    data: Record<string, { status: string; message?: string; details?: { error?: string } }>;
  };
  for (const receipt of Object.values(data ?? {})) {
    if (receipt.status === 'ok') console.log('[push] Delivered to Google (FCM)');
    else console.error(`[push] Delivery failed: ${receipt.details?.error ?? ''} ${receipt.message ?? ''}`);
  }
}

const router = Router();

// POST /api/push/register { token } — called by the app after login.
router.post('/register', (req, res) => {
  const token = req.body?.token;
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    res.status(400).json({ error: 'Invalid push token' });
    return;
  }
  if (!phones.has(token)) {
    phones.set(token, allOn());
    save();
    console.log(`[push] New phone registered (${phones.size} in total)`);
  }
  res.json({ ok: true });
});

// GET /api/push/prefs?token=… → { bookings, hourly, closing, punchIn } for this phone.
router.get('/prefs', (req, res) => {
  const prefs = typeof req.query.token === 'string' ? phones.get(req.query.token) : undefined;
  if (!prefs) {
    res.status(404).json({ error: 'Unknown phone' });
    return;
  }
  res.json(prefs);
});

// PUT /api/push/prefs { token, prefs: { hourly: false, … } } → the phone's updated choices.
router.put('/prefs', (req, res) => {
  const token = req.body?.token;
  const current = typeof token === 'string' ? phones.get(token) : undefined;
  if (!current) {
    res.status(404).json({ error: 'Unknown phone' });
    return;
  }
  for (const kind of KINDS) {
    if (typeof req.body?.prefs?.[kind] === 'boolean') current[kind] = req.body.prefs[kind];
  }
  save();
  res.json(current);
});

// POST /api/push/test — the "Send testvarsel" button in Innstillinger.
router.post('/test', async (_req, res) => {
  try {
    const phones = await sendPush('Playworld Hub', 'Testvarsel: varslene fungerer 🎉');
    console.log(`[push] Test sent to ${phones} phone(s)`);
    res.json({ ok: true, phones });
  } catch (err) {
    console.error('[push] Test failed:', (err as Error).message);
    res.status(502).json({ error: 'Push failed' });
  }
});

export default router;
