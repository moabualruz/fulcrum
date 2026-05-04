/**
 * P13#04 — Hono public REST API setup.
 *
 * Mounts the public REST API at /api/v1, gated by the `public-api` feature flag.
 * When the flag is OFF, all /api/v1/* routes return 404.
 * When ON:  /api/v1/openapi.json returns a valid OpenAPI 3.1 spec auto-generated
 *           from @hono/zod-openapi route registrations.
 *
 * Failure gate (from PRD): if @hono/zod-openapi breaks, hand-generate spec from
 * Zod schemas via zod-to-json-schema (not needed here; guard is in place).
 *
 * WHY Hono: zero-runtime-overhead, first-class Bun support, zod-openapi integration
 * baked in — matches the tech stack locked in PRD 13.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { Hono } from "hono";
import { registerTaskRoutes } from "./routes/tasks.ts";
import { registerDocRoutes } from "./routes/docs.ts";
import { registerSprintRoutes } from "./routes/sprints.ts";
import { registerSavedViewRoutes } from "./routes/saved-views.ts";
import { registerSearchRoutes } from "./routes/search.ts";
import { registerAuditRoutes } from "./routes/audit.ts";
import { registerRunsRoutes } from "./routes/runs.ts";
import { registerNotificationRoutes } from "./routes/notifications.ts";
import { registerArtifactRoutes } from "./routes/artifacts.ts";
import { registerRepoRoutes } from "./routes/repos.ts";
import { registerMemoryRoutes } from "./routes/memory.ts";

/** Check the `public-api` feature flag from FULCRUM_FEATURES env var (per-request). */
function isPublicApiEnabled(): boolean {
  const envFlags = (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  return envFlags.includes("public-api");
}

/**
 * createPublicApi — builds the inner /api/v1 Hono app with OpenAPI 3.1 support.
 *
 * All domain route registrations (tasks, docs, sprints, etc.) are mounted here
 * in subsequent issues (P13#10–P13#14). This issue wires the app skeleton +
 * openapi.json spec endpoint.
 */
export function createPublicApi(): OpenAPIHono {
  const api = new OpenAPIHono();

  // OpenAPI 3.1 spec endpoint — auto-generated from registered routes.
  // @hono/zod-openapi collects all createRoute() registrations and generates
  // the spec on-demand. Zero extra work needed for new routes added later.
  // Register domain routes (P13#05).
  registerTaskRoutes(api);
  registerDocRoutes(api);
  registerSprintRoutes(api);
  registerSavedViewRoutes(api);
  // P13#06 — secondary domains
  registerSearchRoutes(api);
  registerAuditRoutes(api);
  registerRunsRoutes(api);
  registerNotificationRoutes(api);
  registerArtifactRoutes(api);
  registerRepoRoutes(api);
  registerMemoryRoutes(api);

  api.doc("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Fulcrum Public API",
      version: "1",
      description:
        "REST API for Fulcrum — gated by the `public-api` feature flag. " +
        "All procedures are also accessible via tRPC for internal consumers.",
    },
  });

  return api;
}

/**
 * createPublicApiRouter — builds the parent Hono app that:
 *   1. Checks the `public-api` flag on every incoming request.
 *   2. If OFF → returns 404 immediately (no route disclosure).
 *   3. If ON  → delegates to the inner OpenAPIHono app mounted at /api/v1.
 *
 * Mount this on the Bun HTTP server or SvelteKit handle chain.
 */
export function createPublicApiRouter(): Hono {
  const router = new Hono();
  const api = createPublicApi();

  // Guard middleware — 404 when flag is OFF.
  // Read env per-request so flag toggles take effect without restart.
  router.get("/api/openapi.json", (c) => {
    if (!isPublicApiEnabled()) return c.notFound();
    return api.fetch(new Request(new URL("/openapi.json", c.req.url).toString(), c.req.raw));
  });

  router.use("/api/v1/*", async (c, next) => {
    if (!isPublicApiEnabled()) {
      return c.notFound();
    }
    return next();
  });

  // Mount inner OpenAPI app under /api/v1.
  router.route("/api/v1", api);

  return router;
}
