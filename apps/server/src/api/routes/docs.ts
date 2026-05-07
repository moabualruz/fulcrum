import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { appErrorToHttpResponse } from "@/application/error-mapping.ts";
import { AppInvariantError } from "@/application/errors.ts";

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

type DocsFacade = DocsCaller["docs"];

export function registerDocRoutes(api: OpenAPIHono): void {
  const openapi = api.openapi.bind(api) as (...args: unknown[]) => void;

  openapi(listRoute, async (c: any) => {
    const docsFacade = getDocsFacade(c);
    if (!docsFacade) return applicationRequired(c);
    const docs = await docsFacade.list({});
    return c.json(z.array(DocSchema).parse(toJsonDates(docs)), 200);
  });

  openapi(createRoute_, async (c: any) => {
    const body = c.req.valid("json");
    const docsFacade = getDocsFacade(c);
    if (!docsFacade) return applicationRequired(c);
    const doc = await docsFacade.create({
      title: body.title,
      docType: body.type,
      bodyMd: body.bodyMd,
    });
    return c.json(DocSchema.parse(normalizeDoc(doc)), 201);
  });

  openapi(getRoute, async (c: any) => {
    const id = c.req.valid("param").id;
    const docsFacade = getDocsFacade(c);
    if (!docsFacade) return applicationRequired(c);
    const doc = await docsFacade.get({ id });
    if (!doc) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(DocSchema.parse(normalizeDoc(doc)), 200);
  });

  openapi(patchRoute, async (c: any) => {
    const body = c.req.valid("json");
    const id = c.req.valid("param").id;
    const docsFacade = getDocsFacade(c);
    if (!docsFacade) return applicationRequired(c);
    const doc = await docsFacade.update({
      id,
      title: body.title,
      docType: body.type,
      bodyMd: body.bodyMd,
    });
    if (!doc) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(DocSchema.parse(normalizeDoc(doc)), 200);
  });

  openapi(deleteRoute, async (c: any) => {
    const id = c.req.valid("param").id;
    const docsFacade = getDocsFacade(c);
    if (!docsFacade) return applicationRequired(c);
    const doc = await docsFacade.delete({ id });
    if (!doc) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return new Response(null, { status: 204 });
  });
}

function getDocsFacade(c: { get(key: string): unknown }): DocsFacade | undefined {
  const application = c.get("application") as { docs?: DocsFacade } | undefined;
  if (application?.docs) return application.docs;
  const trpc = c.get("trpc") as DocsCaller | undefined;
  return trpc?.docs;
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

function applicationRequired(c: any): Response {
  const mapped = appErrorToHttpResponse(new AppInvariantError("Application-backed REST docs route is required."));
  return c.json(mapped.body, mapped.status as never);
}
