import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const DocTypeSchema = z.enum(["page", "wiki", "note", "template"]).openapi("DocType");

const DocSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  title: z.string(),
  slug: z.string().optional(),
  type: DocTypeSchema.optional(),
  docType: DocTypeSchema.optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
}).openapi("Doc");

const CreateDocBodySchema = z.object({
  title: z.string().min(1),
  type: DocTypeSchema.default("note"),
  bodyMd: z.string().optional(),
}).openapi("CreateDocBody");

const PatchDocBodySchema = z.object({
  title: z.string().min(1).optional(),
  type: DocTypeSchema.optional(),
  bodyMd: z.string().optional(),
}).openapi("PatchDocBody");

const DocIdParamSchema = z.object({ id: z.string().uuid() });

const ErrorSchema = z.object({ error: z.string(), code: z.string() }).openapi("RestError");

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
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

type DocsCaller = {
  docs: {
    list(input?: unknown): Promise<unknown>;
    create(input: unknown): Promise<unknown>;
    get(input: unknown): Promise<unknown>;
    update(input: unknown): Promise<unknown>;
    delete(input: unknown): Promise<unknown>;
  };
};

export function registerDocRoutes(api: OpenAPIHono): void {
  api.openapi(listRoute, async (c) => {
    const docs = await getDocsCaller(c).docs.list({});
    return c.json(toJsonDates(docs), 200);
  });

  api.openapi(createRoute_, async (c) => {
    const body = c.req.valid("json");
    const doc = await getDocsCaller(c).docs.create({
      title: body.title,
      docType: body.type,
      bodyMd: body.bodyMd,
    });
    return c.json(normalizeDoc(doc), 201);
  });

  api.openapi(getRoute, async (c) => {
    const doc = await getDocsCaller(c).docs.get({ id: c.req.valid("param").id });
    if (!doc) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(normalizeDoc(doc), 200);
  });

  api.openapi(patchRoute, async (c) => {
    const body = c.req.valid("json");
    const doc = await getDocsCaller(c).docs.update({
      id: c.req.valid("param").id,
      title: body.title,
      docType: body.type,
      bodyMd: body.bodyMd,
    });
    if (!doc) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(normalizeDoc(doc), 200);
  });

  api.openapi(deleteRoute, async (c) => {
    const doc = await getDocsCaller(c).docs.delete({ id: c.req.valid("param").id });
    if (!doc) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return new Response(null, { status: 204 });
  });
}

function getDocsCaller(c: { get(key: string): unknown }): DocsCaller {
  const trpc = c.get("trpc") as DocsCaller | undefined;
  if (!trpc?.docs) {
    throw new Error("Doc routes require a tRPC caller in Hono context.");
  }
  return trpc;
}

function normalizeDoc(value: unknown): unknown {
  const doc = toJsonDates(value) as Record<string, unknown>;
  return {
    ...doc,
    type: doc["type"] ?? doc["docType"],
  };
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
