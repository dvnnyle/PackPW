import { Router } from "express";
import { config, hasLogins } from "../config";
import { LOCATIONS, todayInNorway } from "../utils/norway";

const router = Router();

// GET /api/cron/warmup — for an external cron job (e.g. cron-job.org every 5–10 minutes).
// Keeps the service awake and refreshes today's data (every request the app makes on start, including the
// FunButler card on Oversikt), so the app opens with fresh numbers instantly.
// It simply calls this server's own endpoints with ?fresh=1, so it uses exactly the same code and caches.
// Like every /api route it needs the x-api-key header when API_KEY is set.
router.get("/warmup", async (_req, res) => {
  const today = todayInNorway();
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  // Every location that has its own logins (the others aren't connected yet).
  const live = LOCATIONS.filter(hasLogins);
  const perLocation = (list: string[]) =>
    live.flatMap((loc) => list.map((p) => `${p}${p.includes("?") ? "&" : "?"}location=${loc}`));
  const paths = perLocation([
    `/api/dashboard?date=${today}`,
    `/api/sales/hourly?date=${today}`,
    `/api/staff?date=${today}`,
    `/api/bookings?date=${today}`,
    `/api/bookings/upcoming?from=${today}&count=10`,
    "/api/weather",
  ]);
  // Yesterday too, so "I går" on Oversikt and Statistikk is instant. It no longer changes, so it goes through
  // the normal cache (past days are kept for hours) instead of being fetched live every time.
  const cachedPaths = perLocation([
    `/api/dashboard?date=${yesterday}`,
    `/api/sales/hourly?date=${yesterday}`,
  ]);
  const headers = config.apiKey ? { "x-api-key": config.apiKey } : undefined;
  const started = Date.now();

  const results = await Promise.all(
    [
      ...paths.map((path) => ({ path, fresh: true })),
      ...cachedPaths.map((path) => ({ path, fresh: false })),
    ].map(async ({ path, fresh }) => {
      const t = Date.now();
      try {
        const sep = path.includes("?") ? "&" : "?";
        const r = await fetch(
          `http://127.0.0.1:${config.port}${path}${fresh ? `${sep}fresh=1` : ""}`,
          { headers },
        );
        return {
          path: path.split("?")[0],
          status: r.status,
          ms: Date.now() - t,
        };
      } catch (err) {
        return {
          path: path.split("?")[0],
          status: 0,
          ms: Date.now() - t,
          error: (err as Error).message,
        };
      }
    }),
  );

  // Tiny plain-text answer: cron services (cron-job.org) abort responses over a small size limit.
  // Details are in the server log instead.
  const failed = results.filter((r) => r.status !== 200);
  console.log(`[cron] warmup ${Date.now() - started} ms`, failed.length ? failed : "all ok");
  res
    .status(failed.length ? 502 : 200)
    .type("text/plain")
    .send(failed.length ? `fail ${failed.map((r) => r.path).join(",")}` : "ok");
});

export default router;
