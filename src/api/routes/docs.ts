/**
 * P13#05 — REST routes for the docs domain.
 *
 * C2 decision: doc_type defaults to "note" on create.
 * Pillar 7 replaces stub store with real DocumentRepository.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

// ── Schemas ──────────────────────────────────────────────────────────────────

const DocTypeSchema = z
  .enum(["page", "wiki", "note", "template"])
  .openapi("DocType");

const DocSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    title: z.string(),
    type: DocTypeSchema,
    createdAt: z.string().datetime(),
  })
  .openapi("Doc");

const CreateDocBodySchema = z
  .object({
    orgId: z.string().uuid(),
    title: z.string().min(1),
    type: DocTypeSchema.default("note"),
  })
  .openapi("CreateDocBody");

const PatchDocBodySchema = z
  .object({
    title: z.string().min(1).optional(),
    type: DocTypeSchema.optional(),
  })
  .openapi("PatchDocBody");

const DocIdParamSchema = z.object({ id: z.string().uuid() });

const ErrorSchema = z
  .object({ error: z.string(), code: z.string() })
  .openapi("RestError");

// ── In-memory stub store ─────────────────────────────────────────────────────

const FIXED_ORG = "11111111-1111-4111-8111-111111111111";

function makeStubStore(): Map<string, z.infer<typeof DocSchema>> {
  return new Map([
    [
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        orgId: FIXED_ORG,
        title: "Stub doc",
        type: "note" as const,
        createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
    ],
  ]);
}

function extractOrgId(auth: string | null): string | null {
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/, "");
  if (token.startsWith("test-jwt:")) return token.slice("test-jwt:".length);
  return null;
}

// ── Routes ───────────────────────────────────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/docs",
  tags: ["docs"],
  summary: "List docs",
  responses: {
    200: { content: { "application/json": { schema: z.array(DocSchema) } }, description: "Doc list" },
  },
});

const createRoute_ = createRoute({
  method: "post",
  path: "/docs",
  tags: ["docs"],
  summary: "Create a doc",
  request: { body: { content: { "application/json": { schema: CreateDocBodySchema } } } },
  responses: {
    201: { content: { "application/json": { schema: DocSchema } }, description: "Created doc" },
  },
});

const getRoute = createRoute({
  method: "get",
  path: "/docs/{id}",
  tags: ["docs"],
  summary: "Get a doc by ID",
  request: { params: DocIdParamSchema },
  responses: {
    200: { content: { "application/json": { schema: DocSchema } }, description: "Doc" },
    403: { content: { "application/json": { schema: ErrorSchema } }, description: "Forbidden" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

const patchRoute = createRoute({
  method: "patch",
  path: "/docs/{id}",
  tags: ["docs"],
  summary: "Update a doc",
  request: {
    params: DocIdParamSchema,
    body: { content: { "application/json": { schema: PatchDocBodySchema } } },
  },
  responses: {
    200: { content: { "application/json": { schema: DocSchema } }, description: "Updated doc" },
    403: { content: { "application/json": { schema: ErrorSchema } }, description: "Forbidden" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/docs/{id}",
  tags: ["docs"],
  summary: "Delete a doc",
  request: { params: DocIdParamSchema },
  responses: {
    204: { description: "Deleted" },
    403: { content: { "application/json": { schema: ErrorSchema } }, description: "Forbidden" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

export function registerDocRoutes(api: OpenAPIHono): void {
  const store = makeStubStore();

  api.openapi(listRoute, (c) => {
    return c.json([...store.values()], 200);
  });

  api.openapi(createRoute_, async (c) => {
    const body = c.req.valid("json");
    const doc: z.infer<typeof DocSchema> = {
      id: crypto.randomUUID(),
      orgId: body.orgId,
      title: body.title,
      type: body.type,
      createdAt: new Date().toISOString(),
    };
    store.set(doc.id, doc);
    return c.json(doc, 201);
  });

  api.openapi(getRoute, (c) => {
    const { id } = c.req.valid("param");
    const callerOrg = extractOrgId(c.req.header("Authorization") ?? null);
    const doc = store.get(id);
    if (!doc) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    if (callerOrg !== doc.orgId) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
    return c.json(doc, 200);
  });

  api.openapi(patchRoute, async (c) => {
    const { id } = c.req.valid("param");
    const callerOrg = extractOrgId(c.req.header("Authorization") ?? null);
    const doc = store.get(id);
    if (!doc) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    if (callerOrg !== doc.orgId) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
    const patch = c.req.valid("json");
    const updated = { ...doc, ...patch };
    store.set(id, updated);
    return c.json(updated, 200);
  });

  api.openapi(deleteRoute, (c) => {
    const { id } = c.req.valid("param");
    const callerOrg = extractOrgId(c.req.header("Authorization") ?? null);
    const doc = store.get(id);
    if (!doc) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    if (callerOrg !== doc.orgId) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
    store.delete(id);
    return new Response(null, { status: 204 });
  });
}
