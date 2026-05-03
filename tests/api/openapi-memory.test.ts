import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createPublicApiRouter } from "../../src/api/hono.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function req(method: string, path: string, body?: unknown, orgId = ORG_ID): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: `Bearer test-jwt:${orgId}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("P8#14 memory REST OpenAPI routes", () => {
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

  it("returns 404 for memory routes when public-api flag is off", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const app = createPublicApiRouter();

    const res = await app.fetch(req("GET", "/api/v1/memory"));

    expect(res.status).toBe(404);
  });

  it("requires Bearer auth for memory routes", async () => {
    const app = createPublicApiRouter();

    const res = await app.fetch(new Request("http://localhost/api/v1/memory"));

    expect(res.status).toBe(401);
  });

  it("creates, lists, and deletes memory rows", async () => {
    const app = createPublicApiRouter();

    const createdRes = await app.fetch(req("POST", "/api/v1/memory", {
      body: "REST memory should call the same memory surface.",
      kind: "decision",
      tags: ["api", "memory"],
      importance: "high",
    }));
    expect(createdRes.status).toBe(201);
    const created = await createdRes.json() as { id: string; body: string };
    expect(created.body).toBe("REST memory should call the same memory surface.");

    const listRes = await app.fetch(req("GET", "/api/v1/memory"));
    expect(listRes.status).toBe(200);
    const list = await listRes.json() as Array<{ id: string }>;
    expect(list.map((memory) => memory.id)).toContain(created.id);

    const deleteRes = await app.fetch(req("DELETE", `/api/v1/memory/${created.id}?confirm=true`));
    expect(deleteRes.status).toBe(200);
    expect(await deleteRes.json()).toEqual({ deleted: true });

    const afterDeleteRes = await app.fetch(req("GET", "/api/v1/memory"));
    const afterDelete = await afterDeleteRes.json() as Array<{ id: string }>;
    expect(afterDelete.map((memory) => memory.id)).not.toContain(created.id);
  });

  it("returns 400 when deleting without confirm=true", async () => {
    const app = createPublicApiRouter();
    const createdRes = await app.fetch(req("POST", "/api/v1/memory", { body: "Delete me" }));
    const created = await createdRes.json() as { id: string };

    const res = await app.fetch(req("DELETE", `/api/v1/memory/${created.id}`));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "CONFIRM_REQUIRED" });
  });

  it("returns 422 with details for invalid PATCH input", async () => {
    const app = createPublicApiRouter();
    const createdRes = await app.fetch(req("POST", "/api/v1/memory", { body: "Patch me" }));
    const created = await createdRes.json() as { id: string };

    const res = await app.fetch(req("PATCH", `/api/v1/memory/${created.id}`, { body: "" }));

    expect(res.status).toBe(422);
    const error = await res.json() as { code: string; details?: unknown };
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details).toBeDefined();
  });

  it("supports memory actions and context preview", async () => {
    const app = createPublicApiRouter();
    const createdRes = await app.fetch(req("POST", "/api/v1/memory", { body: "Action me" }));
    const created = await createdRes.json() as { id: string };

    expect((await app.fetch(req("POST", `/api/v1/memory/${created.id}/promote`))).status).toBe(200);
    expect((await app.fetch(req("POST", `/api/v1/memory/${created.id}/archive`))).status).toBe(200);
    expect((await app.fetch(req("POST", `/api/v1/memory/${created.id}/restore`))).status).toBe(200);

    const previewRes = await app.fetch(req("GET", "/api/v1/context/preview?taskId=task-123"));
    expect(previewRes.status).toBe(200);
    const preview = await previewRes.json() as { procedure: string; input: { taskId: string } };
    expect(preview.procedure).toBe("context.preview");
    expect(preview.input.taskId).toBe("task-123");
  });

  it("includes all memory routes in the OpenAPI spec", async () => {
    const app = createPublicApiRouter();

    const res = await app.fetch(req("GET", "/api/v1/openapi.json"));

    expect(res.status).toBe(200);
    const spec = await res.json() as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi).toMatch(/^3\.1\./);
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining([
      "/memory",
      "/memory/{id}",
      "/memory/{id}/promote",
      "/memory/{id}/archive",
      "/memory/{id}/restore",
      "/context/preview",
    ]));
  });
});
