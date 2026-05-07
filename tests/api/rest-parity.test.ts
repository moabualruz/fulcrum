import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createPublicApiRouter } from "@fulcrum/server/api/hono.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function req(method: string, path: string, body?: unknown, orgId: string = ORG_ID): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: `Bearer test-jwt:${orgId}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("P13#05 — REST parity boundary closure", () => {
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

  it("returns 404 on resource routes when public-api flag is off", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const app = createPublicApiRouter();

    const res = await app.fetch(req("GET", "/api/v1/tasks"));

    expect(res.status).toBe(404);
  });

  it("returns canonical invariant errors instead of route-local stores for no-deps resources", async () => {
    const app = createPublicApiRouter();

    for (const [method, path, body] of [
      ["POST", "/api/v1/tasks", { orgId: ORG_ID, title: "Test task", status: "todo" }],
      ["GET", "/api/v1/tasks"],
      ["GET", "/api/v1/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      ["PATCH", "/api/v1/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { title: "Updated" }],
      ["DELETE", "/api/v1/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      ["POST", "/api/v1/docs", { title: "My note" }],
      ["GET", "/api/v1/docs"],
      ["GET", "/api/v1/docs/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      ["PATCH", "/api/v1/docs/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", { title: "Renamed" }],
      ["DELETE", "/api/v1/docs/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      ["POST", "/api/v1/sprints", { orgId: ORG_ID, name: "Sprint 1", status: "planning" }],
      ["GET", "/api/v1/sprints"],
      ["GET", "/api/v1/sprints/cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
      ["PATCH", "/api/v1/sprints/cccccccc-cccc-4ccc-8ccc-cccccccccccc", { name: "Sprint 1 revised" }],
      ["DELETE", "/api/v1/sprints/cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
      ["GET", "/api/v1/saved-views"],
      ["POST", "/api/v1/saved-views", { orgId: ORG_ID, name: "My view", scope: "private", viewType: "list" }],
      ["DELETE", "/api/v1/saved-views/dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
    ] as const) {
      const res = await app.fetch(req(method, path, body));
      expect(res.status, `${method} ${path}`).toBe(500);
      expect(await res.json(), `${method} ${path}`).toMatchObject({ code: "invariant" });
    }
  });

  it("OpenAPI includes tasks, docs, sprints, saved-views paths", async () => {
    const app = createPublicApiRouter();

    const res = await app.fetch(req("GET", "/api/v1/openapi.json"));

    expect(res.status).toBe(200);
    const spec = await res.json() as { paths: Record<string, unknown> };
    const paths = Object.keys(spec.paths ?? {});
    expect(paths.some((p) => p.startsWith("/tasks"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/docs"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/sprints"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/saved-views"))).toBe(true);
  });
});
