import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const RunStatusSchema = z.enum([
  "unclaimed",
  "claimed",
  "running",
  "retryqueued",
  "released",
  "completed",
  "failed",
  "cancelled",
]).openapi("RunStatus");

const AgentRunSchema = z.object({
  id: z.string(),
  state: RunStatusSchema.optional(),
  orchestrationState: RunStatusSchema.optional().nullable(),
  workspacePath: z.string().nullable().optional(),
  attemptCount: z.number().int().optional(),
  nextRetryAt: z.string().datetime().nullable().optional(),
  lastErrorKind: z.string().nullable().optional(),
}).openapi("AgentRun");

const RunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const RunIdParamSchema = z.object({ id: z.string().min(1) });

const ErrorSchema = z.object({ error: z.string(), code: z.string() }).openapi("RunsError");

const listRoute = createRoute({
  method: "get",
  path: "/runs",
  tags: ["runs"],
  summary: "List agent runs",
  request: { query: RunsQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(AgentRunSchema) } },
      description: "Agent runs",
    },
  },
});

const getRoute = createRoute({
  method: "get",
  path: "/runs/{id}",
  tags: ["runs"],
  summary: "Get agent run by ID",
  request: { params: RunIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: AgentRunSchema } },
      description: "Agent run",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Not found",
    },
  },
});

type RunsCaller = {
  orchestration: {
    listRuns(input: { limit?: number; offset?: number }): Promise<unknown>;
    getRun(input: { runId: string }): Promise<unknown>;
  };
};

export function registerRunsRoutes(api: OpenAPIHono): void {
  const openapi = api.openapi.bind(api) as (...args: unknown[]) => void;

  openapi(listRoute, async (c: any) => {
    const runs = await getRunsCaller(c).orchestration.listRuns(c.req.valid("query"));
    return c.json(z.array(AgentRunSchema).parse(toJsonDates(runs)), 200);
  });

  openapi(getRoute, async (c: any) => {
    const run = await getRunsCaller(c).orchestration.getRun({ runId: c.req.valid("param").id });
    if (!run) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(AgentRunSchema.parse(toJsonDates(run)), 200);
  });
}

function getRunsCaller(c: { get(key: string): unknown }): RunsCaller {
  const trpc = c.get("trpc") as RunsCaller | undefined;
  if (!trpc?.orchestration) {
    throw new Error("Run routes require a tRPC caller in Hono context.");
  }
  return trpc;
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
