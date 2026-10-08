import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';

// Push notifications to the phone app through Expo's push service (which hands them to Google FCM).
// The app sends its Expo push token after every login/app start; tokens are kept in a JSON file.
// On Render, point PUSH_TOKENS_FILE at a persistent disk (e.g. /var/data/push-tokens.json) so they survive
// deploys; without one the list starts empty after a deploy and fills up again as phones open the app.
const TOKENS_FILE = path.resolve(process.env.PUSH_TOKENS_FILE ?? 'data/push-tokens.json');
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const TOKEN_PATTERN = /^Expo(nent)?PushToken\[[\w-]+\]$/;

function load(): Set<string> {
  try {
    return new Set(JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

const tokens = load();

function save() {
  try {
    fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
    fs.writeFileSync(TOKENS_FILE, JSON.stringify([...tokens]));
  } catch (err) {
    console.error('[push] Could not save tokens:', (err as Error).message);
  }
}

// Sends one notification to every registered phone. Tokens Expo reports as gone (app uninstalled) are dropped.
export async function sendPush(title: string, body: string): Promise<number> {
  const all = [...tokens];
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
      if (ticket.details?.error === 'DeviceNotRegistered') tokens.delete(batch[j]);
    });
  }
  save();
  return tokens.size;
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
  if (!tokens.has(token)) {
    tokens.add(token);
    save();
    console.log(`[push] New phone registered (${tokens.size} in total)`);
  }
  res.json({ ok: true });
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
