import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { config } from '../config';

const AUTH_DIR = path.resolve('playwright/.auth');

let browserPromise: Promise<Browser> | null = null;

// Chromium only runs for logins (about once an hour per site), so it is closed when idle to free memory;
// Render's free instance has 512 MB.
const IDLE_CLOSE_MS = 60_000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

// One shared Chromium instance for the whole server; each service gets its own context.
export function getBrowser(): Promise<Browser> {
  if (idleTimer) clearTimeout(idleTimer);
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: config.headless,
      // Lower memory use on small servers: no GPU, and /tmp instead of the tiny shared-memory disk.
      args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--disable-extensions'],
    });
    browserPromise.then((browser) => browser.on('disconnected', () => (browserPromise = null)));
  }
  return browserPromise;
}

function authFile(sessionName: string): string {
  return path.join(AUTH_DIR, `${sessionName}.json`);
}

// Images, fonts and video are never needed: services only read tokens, cookies, JSON and table text.
const BLOCKED_TYPES = new Set(['image', 'media', 'font']);

// Contexts are handed out one at a time, so several logins (e.g. at startup) never run Chromium tabs in
// parallel. The next caller gets its context when the previous one is closed.
let queue: Promise<void> = Promise.resolve();

// Opens a context that reuses the saved login session for this service, if one exists.
// Callers must close it (in a finally block) to let the next one run.
export async function newContext(sessionName: string): Promise<BrowserContext> {
  let release!: () => void;
  const previous = queue;
  queue = new Promise((resolve) => (release = resolve));
  await previous;

  try {
    const browser = await getBrowser();
    const file = authFile(sessionName);
    const context = await browser.newContext({ storageState: fs.existsSync(file) ? file : undefined });
    context.setDefaultTimeout(config.browserTimeoutMs);
    context.setDefaultNavigationTimeout(config.browserTimeoutMs);
    await context.route('**/*', (route) =>
      BLOCKED_TYPES.has(route.request().resourceType()) ? route.abort() : route.continue(),
    );

    const close = context.close.bind(context);
    context.close = async (...args) => {
      try {
        return await close(...args);
      } finally {
        release();
        // Close Chromium if nobody needs it for a while.
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => void closeBrowser(), IDLE_CLOSE_MS);
      }
    };
    return context;
  } catch (err) {
    release();
    throw err;
  }
}

export async function saveSession(context: BrowserContext, sessionName: string): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await context.storageState({ path: authFile(sessionName) });
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    browserPromise = null;
    await browser.close();
  }
}

// "name=value; …" Cookie header from a saved session, for cookies that apply to `url`'s host.
// Lets services make plain fetch requests with the browser's login instead of opening a page.
export function sessionCookieHeader(sessionName: string, url: string): string {
  const file = authFile(sessionName);
  if (!fs.existsSync(file)) return '';
  const { cookies } = JSON.parse(fs.readFileSync(file, 'utf8')) as { cookies: { name: string; value: string; domain: string }[] };
  const host = new URL(url).hostname;
  return cookies
    .filter((c) => host === c.domain.replace(/^\./, '') || host.endsWith(c.domain.startsWith('.') ? c.domain : `.${c.domain}`))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

// The browser's own User-Agent. Some sites (Cloudflare's cf_clearance cookie) only accept a cookie
// together with the User-Agent it was issued to, so plain fetch requests send this one.
let userAgentPromise: Promise<string> | null = null;
export function browserUserAgent(): Promise<string> {
  userAgentPromise ??= getBrowser().then(async (browser) => {
    const page = await browser.newPage();
    try {
      return await page.evaluate(() => navigator.userAgent);
    } finally {
      await page.close();
    }
  });
  return userAgentPromise;
}
