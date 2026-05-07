import { describe, expect, test } from "bun:test";
import { createPublicApi } from "@fulcrum/server/api/hono.ts";
import { isPublicApiEnabled } from "@fulcrum/server/api/feature-flags.ts";

const VALID_KEY_HASH = await hashKey("test-api-key");

interface OpenApiSpec {
  openapi: string;
  info: { title: string };
  paths: Record<string, unknown>;
}

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function app() {
  return createPublicApi({
    apiAuth: {
      async findApiKeyByHash(hash) {
        if (hash !== VALID_KEY_HASH) return null;
        return { org_id: "org-1", user_id: "user-1" };
      },
    },
    application: {
      sprints: {
        async listSprints() {
          return { data: [{ id: "sprint-1", name: "Sprint 1" }] };
        },
      },
      reports: {
        async burndown() {
          return { data: [] };
        },
        async velocity() {
          return { data: [] };
        },
      },
    },
  });
}

function authHeaders(token = "test-api-key") {
  return { Authorization: `Bearer ${token}` };
}

describe("isPublicApiEnabled", () => {
  test("returns false when FULCRUM_FEATURES unset", () => {
    const old = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    expect(isPublicApiEnabled()).toBe(false);
    if (old !== undefined) process.env.FULCRUM_FEATURES = old;
  });

  test("returns true when FULCRUM_FEATURES includes public-api", () => {
    const old = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "other,public-api,another";
    expect(isPublicApiEnabled()).toBe(true);
    process.env.FULCRUM_FEATURES = old ?? "";
  });
});

describe("public API auth", () => {
  test("unauthenticated request returns 401", async () => {
    const res = await app().request("/sprints?project_id=project-1");
    expect(res.status).toBe(401);
  });

  test("invalid API key returns 401", async () => {
    const res = await app().request("/sprints?project_id=project-1", {
      headers: authHeaders("invalid-key"),
    });
    expect(res.status).toBe(401);
  });

  test("valid API key reaches application routes", async () => {
    const res = await app().request("/sprints?project_id=project-1", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toEqual([{ id: "sprint-1", name: "Sprint 1" }]);
  });
});

describe("OpenAPI spec", () => {
  test("GET /openapi.json returns valid spec", async () => {
    const res = await createPublicApi().request("/openapi.json");
    expect(res.status).toBe(200);
    const spec = await res.json() as OpenApiSpec;
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("Fulcrum Public API");
    expect(spec.paths["/sprints"]).toBeDefined();
  });
});
