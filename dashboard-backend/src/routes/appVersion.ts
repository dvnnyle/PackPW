import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { cached } from '../cache/cache';

const router = Router();

// The latest released Android build is described in dashboard-backend/app-version.json.
// Deployed, the backend reads it from GitHub (APP_VERSION_URL, the raw file on main), so publishing an update
// is just a push of that file — no redeploy or restart. Locally (no APP_VERSION_URL) it reads the file on disk.
const FILE = path.resolve('app-version.json');
const REMOTE_URL = process.env.APP_VERSION_URL ?? '';

interface AppVersion {
  version: string; // shown to people, e.g. "1.0.5"
  versionCode: number; // Android versionCode; this is what the app compares
  apkUrl: string; // HTTPS link straight to the .apk file
  mandatory: boolean;
  releaseNotes: string[];
}

async function loadRaw(): Promise<Partial<AppVersion>> {
  if (REMOTE_URL) {
    const response = await fetch(REMOTE_URL, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Could not fetch app-version.json (HTTP ${response.status})`);
    return (await response.json()) as Partial<AppVersion>;
  }
  return JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<AppVersion>;
}

function validate(raw: Partial<AppVersion>): AppVersion {
  if (typeof raw.version !== 'string' || !Number.isInteger(raw.versionCode)) {
    throw new Error('app-version.json needs "version" (string) and "versionCode" (integer)');
  }
  // Only ever hand out an HTTPS download link.
  const apkUrl = typeof raw.apkUrl === 'string' && raw.apkUrl.startsWith('https://') ? raw.apkUrl : '';
  return {
    version: raw.version,
    versionCode: raw.versionCode!,
    apkUrl,
    mandatory: raw.mandatory === true,
    releaseNotes: Array.isArray(raw.releaseNotes) ? raw.releaseNotes.filter((n) => typeof n === 'string') : [],
  };
}

// GET /api/app-version → public metadata about the latest app build (no secrets). Cached for a minute.
router.get('/', async (_req, res) => {
  try {
    res.json(await cached('app-version', 60_000, async () => validate(await loadRaw())));
  } catch (err) {
    console.error('[app-version] Could not read app-version.json:', err);
    res.status(500).json({ error: 'App version information is not available' });
  }
});

export default router;
