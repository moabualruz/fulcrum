/**
 * Notification + audit REST adapter smoke tests.
 */
import { describe, expect, test } from "bun:test";
import { createPublicApi } from "@fulcrum/server/api/hono.ts";

const VALID_KEY_HASH = await hashKey("test-api-key");

interface OpenApiSpec {
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
      notifications: {
        async listNotifications() {
          return { data: [{ id: "notification-1", title: "Test notification" }] };
        },
      },
      audit: {
        async queryAuditEvents() {
          return { data: [{ id: "event-1", kind: "task" }], total: 1 };
        },
      },
    },
  });
}

function authHeaders(token = "test-api-key") {
  return { Authorization: `Bearer ${token}` };
}

describe("GET /notifications", () => {
  test("returns 401 without auth", async () => {
    const res = await app().request("/notifications");
    expect(res.status).toBe(401);
  });

  test("returns application notifications with valid auth", async () => {
    const res = await app().request("/notifications", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toEqual([{ id: "notification-1", title: "Test notification" }]);
  });
});

describe("GET /audit", () => {
  test("returns 401 without auth", async () => {
    const res = await app().request("/audit");
    expect(res.status).toBe(401);
  });

  test("returns application audit events with valid auth", async () => {
    const res = await app().request("/audit?kind=task", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: [{ id: "event-1", kind: "task" }], total: 1 });
  });
});

describe("OpenAPI spec", () => {
  test("notification and audit endpoints are present", async () => {
    const res = await createPublicApi().request("/openapi.json");
    expect(res.status).toBe(200);
    const spec = await res.json() as OpenApiSpec;
    expect(spec.paths["/notifications"]).toBeDefined();
    expect(spec.paths["/audit"]).toBeDefined();
  });
});
