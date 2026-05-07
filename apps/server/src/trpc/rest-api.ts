import { Hono } from "hono";
import {
  getOrchestratorStatus,
  getRun,
  listRuns,
  type LegacySymphonyStore,
} from "@/application/legacy/symphony.ts";

/**
 * Feature-gated REST routes. Mounted only when FULCRUM_FEATURES includes
 * "public-api". Thin wrapper around the same data-layer functions that tRPC
 * procedures call — no business logic here.
 *
 * Routes:
 *   GET  /api/v1/symphony/state         → orchestrator status
 *   GET  /api/v1/symphony/:identifier   → single run by id
 *   POST /api/v1/symphony/refresh       → re-list runs (trigger refresh)
 */

/** @deprecated Use `isPublicApiEnabled` from `apps/server/src/api/feature-flags.ts` instead. */
export { isPublicApiEnabled } from "@fulcrum/server/api/feature-flags.ts";

export function createSymphonyRestApi(store: LegacySymphonyStore, orgId: string): Hono {
  const app = new Hono();

  app.get("/api/v1/symphony/state", async (c) => {
    const status = await getOrchestratorStatus(store, orgId);
    return c.json(status);
  });

  app.get("/api/v1/symphony/:identifier", async (c) => {
    const id = c.req.param("identifier");
    const run = await getRun(store, id);
    if (!run) return c.json({ error: "not found" }, 404);
    return c.json(run);
  });

  app.post("/api/v1/symphony/refresh", async (c) => {
    const runs = await listRuns(store, orgId, { limit: 50 });
    return c.json({ runs, count: runs.length });
  });

  return app;
}
