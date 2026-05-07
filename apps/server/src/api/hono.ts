/**
 * Unified public REST API — single Hono entry point.
 *
 * Consolidates REST/OpenAPI routes under one adapter.
 *
 * Auth: Bearer API-key (SHA-256 hash lookup) via apps/server/src/api/auth.ts.
 * Feature gate: FULCRUM_FEATURES=public-api (OFF → 404).
 * OpenAPI 3.1 spec at /openapi.json.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { Hono } from "hono";
import { isPublicApiEnabled } from "./feature-flags.ts";
import { apiKeyAuth, type ApiEnv } from "./auth.ts";
import { rateLimit } from "./rate-limit.ts";
import {
  emptyPublicApiApplication,
  type ApiKeyLookup,
  type PublicApiApplication,
} from "./application.ts";

import { registerKernelTaskRoutes } from "./routes/kernel-tasks.ts";
import { registerKernelSprintRoutes } from "./routes/kernel-sprints.ts";
import { registerKernelReportRoutes } from "./routes/kernel-reports.ts";
import { registerKernelNotificationRoutes } from "./routes/kernel-notifications.ts";
import { registerKernelAuditRoutes } from "./routes/kernel-audit.ts";

import { registerTaskRoutes } from "./routes/tasks.ts";
import { registerDocRoutes } from "./routes/docs.ts";
import { registerSprintRoutes } from "./routes/sprints.ts";
import { registerSearchRoutes } from "./routes/search.ts";
import { registerAuditRoutes } from "./routes/audit.ts";
import { registerRunsRoutes } from "./routes/runs.ts";
import { registerNotificationRoutes } from "./routes/notifications.ts";
import { registerArtifactRoutes } from "./routes/artifacts.ts";
import { registerRepoRoutes } from "./routes/repos.ts";
import { registerMemoryRoutes } from "./routes/memory.ts";
import { registerSavedViewRoutes } from "./routes/saved-views.ts";

// ── Factory ─────────────────────────────────────────────────────────

export interface PublicApiDeps {
  db?: unknown;
  apiAuth?: ApiKeyLookup;
  application?: PublicApiApplication;
  trpc?: unknown;
}

/**
 * createPublicApi — builds the inner /api/v1 Hono app with OpenAPI 3.1 support.
 *
 * When `deps` provided: mounts authenticated routes backed by application delegates.
 * When omitted: mounts route metadata for tests/static spec generation.
 */
export function createPublicApi(deps?: PublicApiDeps): OpenAPIHono {
  const api = new OpenAPIHono<ApiEnv>();

  if (deps) {
    api.use("*", async (c, next) => {
      if (deps.db) c.set("db", deps.db);
      c.set("application", deps.application ?? emptyPublicApiApplication);
      if (deps.apiAuth) c.set("apiAuth", deps.apiAuth);
      if (deps.trpc) c.set("trpc", deps.trpc);
      return next();
    });

    // Auth on all routes except /openapi.json
    api.use("*", async (c, next) => {
      if (c.req.path === "/openapi.json") return next();
      return apiKeyAuth()(c, next);
    });
  }

  api.use("*", rateLimit());

  if (deps) {
    registerKernelTaskRoutes(api);
    registerKernelSprintRoutes(api, { application: deps.application?.sprints });
    registerKernelReportRoutes(api, { application: deps.application?.reports });
    registerKernelNotificationRoutes(api, { application: deps.application?.notifications });
    registerKernelAuditRoutes(api, { application: deps.application?.audit });
  }

  // Cast needed: legacy route modules use OpenAPIHono<Env>; ApiEnv is a superset.
  const base = api as unknown as OpenAPIHono;
  if (!deps) registerTaskRoutes(base);
  registerDocRoutes(base);
  if (!deps) registerSprintRoutes(base);
  registerSearchRoutes(base);
  if (!deps) registerAuditRoutes(base);
  registerRunsRoutes(base);
  if (!deps) registerNotificationRoutes(base);
  registerArtifactRoutes(base);
  registerRepoRoutes(base);
  registerMemoryRoutes(base);
  registerSavedViewRoutes(base);

  // OpenAPI 3.1 spec
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

  // Return as base OpenAPIHono so callers don't need ApiEnv import
  return api as unknown as OpenAPIHono;
}

/**
 * createPublicApiRouter — builds the parent Hono app that:
 *   1. Checks the `public-api` flag on every incoming request.
 *   2. If OFF → returns 404 immediately (no route disclosure).
 *   3. If ON  → delegates to the inner OpenAPIHono app mounted at /api/v1.
 */
export function createPublicApiRouter(deps?: PublicApiDeps): Hono {
  const router = new Hono();
  const api = createPublicApi(deps);
  let staticSpec: unknown;

  // Guard middleware — 404 when flag is OFF.
  router.get("/api/openapi.json", (c) => {
    staticSpec ??= api.getOpenAPI31Document({
      openapi: "3.1.0",
      info: {
        title: "Fulcrum Public API",
        version: "1",
        description:
          "REST API for Fulcrum — gated by the `public-api` feature flag. " +
          "All procedures are also accessible via tRPC for internal consumers.",
      },
    });
    return c.json(staticSpec);
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
