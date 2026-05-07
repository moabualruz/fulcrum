import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

import { createPublicApiRouter } from "@fulcrum/server/api/hono.ts";

const ROUTE_FILES = [
  "apps/server/src/api/routes/tasks.ts",
  "apps/server/src/api/routes/docs.ts",
  "apps/server/src/api/routes/memory.ts",
  "apps/server/src/api/routes/sprints.ts",
  "apps/server/src/api/routes/saved-views.ts",
  "apps/server/src/api/routes/notifications.ts",
  "apps/server/src/api/routes/search.ts",
];

function req(path: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: { Authorization: "Bearer test-jwt:11111111-1111-4111-8111-111111111111" },
  });
}

describe("REST fallback store closure", () => {
  let originalFeatures: string | undefined;

  beforeEach(() => {
    originalFeatures = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "public-api";
  });

  afterEach(() => {
    if (originalFeatures === undefined) {
      delete process.env["FULCRUM_FEATURES"];
    } else {
      process.env["FULCRUM_FEATURES"] = originalFeatures;
    }
  });

  it("target REST routes do not define route-local fallback stores or stubs", async () => {
    for (const path of ROUTE_FILES) {
      const source = await readFile(path, "utf8");
      expect(source, path).not.toMatch(/\bnew Map\b|fallback|Fallback|STUB|Stub|stub store|seed data/);
    }
  });

  it("no-deps REST resources return canonical invariant errors instead of local data", async () => {
    const app = createPublicApiRouter();

    for (const path of [
      "/api/v1/tasks",
      "/api/v1/docs",
      "/api/v1/memory",
      "/api/v1/sprints",
      "/api/v1/saved-views",
      "/api/v1/notifications",
      "/api/v1/search?q=stub",
    ]) {
      const res = await app.fetch(req(path));
      expect(res.status, path).toBe(500);
      expect(await res.json(), path).toMatchObject({ code: "invariant" });
    }
  });
});
