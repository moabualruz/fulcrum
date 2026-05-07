import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createPublicApiRouter } from "@fulcrum/server/api/hono.ts";

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

function appWithMemoryFacade() {
  type MemoryRow = {
    id: string;
    orgId: string;
    projectId: string | null;
    global: boolean;
    kind: "note" | "decision" | "blocker" | "file_ref" | "section_anchor" | "link" | "fact";
    body: string;
    tags: string[];
    importance: "low" | "medium" | "high";
    source: "heuristic" | "llm" | "manual";
    sourceRef: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    archived: boolean;
  };

  const rows = new Map<string, MemoryRow>();
  const memories = {
    list: async () => [...rows.values()],
    create: async (input: Partial<MemoryRow>) => {
      const now = new Date().toISOString();
      const memory: MemoryRow = {
        id: crypto.randomUUID(),
        orgId: ORG_ID,
        projectId: input.projectId ?? null,
        global: input.global ?? false,
        kind: input.kind ?? "note",
        body: input.body ?? "",
        tags: input.tags ?? [],
        importance: input.importance ?? "medium",
        source: input.source ?? "manual",
        sourceRef: input.sourceRef ?? {},
        createdAt: now,
        updatedAt: now,
        archived: false,
      };
      rows.set(memory.id, memory);
      return memory;
    },
    get: async ({ id }: { id: string }) => rows.get(id) ?? null,
    update: async ({ id, ...patch }: Partial<MemoryRow> & { id: string }) => {
      const current = rows.get(id);
      if (!current) return null;
      const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
      rows.set(id, updated);
      return updated;
    },
    delete: async ({ id }: { id: string }) => {
      rows.delete(id);
      return { deleted: true as const };
    },
    promote: async ({ id }: { id: string }) => rows.get(id) ?? null,
    archive: async ({ id }: { id: string }) => {
      const current = rows.get(id);
      if (!current) return null;
      const updated = { ...current, archived: true, updatedAt: new Date().toISOString() };
      rows.set(id, updated);
      return updated;
    },
    restore: async ({ id }: { id: string }) => {
      const current = rows.get(id);
      if (!current) return null;
      const updated = { ...current, archived: false, updatedAt: new Date().toISOString() };
      rows.set(id, updated);
      return updated;
    },
  };

  return createPublicApiRouter({
    apiAuth: {
      findApiKeyByHash: async () => ({ org_id: ORG_ID, user_id: "user-1" }),
    },
    trpc: { memories },
    application: {
      context: {
        preview: async (input: unknown) => ({ procedure: "context.preview", input }),
      },
    } as never,
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

  it("returns the static OpenAPI spec at /api/openapi.json when public-api flag is off", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const app = createPublicApiRouter();

    const res = await app.fetch(new Request("http://localhost/api/openapi.json"));

    expect(res.status).toBe(200);
    const spec = await res.json() as { paths: Record<string, unknown> };
    expect(Object.keys(spec.paths)).toContain("/memory");
  });

  it("requires Bearer auth for memory routes", async () => {
    const app = createPublicApiRouter();

    const res = await app.fetch(new Request("http://localhost/api/v1/memory"));

    expect(res.status).toBe(401);
  });

  it("creates, lists, and deletes memory rows", async () => {
    const app = appWithMemoryFacade();

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
    const app = appWithMemoryFacade();
    const createdRes = await app.fetch(req("POST", "/api/v1/memory", { body: "Delete me" }));
    const created = await createdRes.json() as { id: string };

    const res = await app.fetch(req("DELETE", `/api/v1/memory/${created.id}`));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "CONFIRM_REQUIRED" });
  });

  it("returns 422 with details for invalid PATCH input", async () => {
    const app = appWithMemoryFacade();
    const createdRes = await app.fetch(req("POST", "/api/v1/memory", { body: "Patch me" }));
    const created = await createdRes.json() as { id: string };

    const res = await app.fetch(req("PATCH", `/api/v1/memory/${created.id}`, { body: "" }));

    expect(res.status).toBe(422);
    const error = await res.json() as { code: string; details?: unknown };
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details).toBeDefined();
  });

  it("supports memory actions and context preview", async () => {
    const app = appWithMemoryFacade();
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
