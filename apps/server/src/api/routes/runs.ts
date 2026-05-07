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
  status: RunStatusSchema.optional(),
  state: RunStatusSchema.optional(),
  orchestrationState: RunStatusSchema.optional().nullable(),
  workspacePath: z.string().nullable().optional(),
  attemptCount: z.number().int().optional(),
  nextRetryAt: z.string().datetime().nullable().optional(),
  lastErrorKind: z.string().nullable().optional(),
}).openapi("AgentRun");

const RunsQuerySchema = z.object({
  status: RunStatusSchema.optional(),
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
    listRuns(input: { status?: z.infer<typeof RunStatusSchema>; limit?: number; offset?: number }): Promise<unknown>;
    getRun(input: { runId: string }): Promise<unknown>;
  };
};

const FALLBACK_RUNS: z.infer<typeof AgentRunSchema>[] = [{
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  status: "running",
  state: "running",
  orchestrationState: "running",
  workspacePath: null,
  attemptCount: 1,
  nextRetryAt: null,
  lastErrorKind: null,
}];

export function registerRunsRoutes(api: OpenAPIHono): void {
  const openapi = api.openapi.bind(api) as (...args: unknown[]) => void;

  openapi(listRoute, async (c: any) => {
    const query = c.req.valid("query");
    const caller = getRunsCaller(c);
    const runs = caller
      ? await caller.orchestration.listRuns(query)
      : FALLBACK_RUNS.filter((run) => !query.status || run.state === query.status);
    return c.json(z.array(AgentRunSchema).parse(toJsonDates(runs)), 200);
  });

  openapi(getRoute, async (c: any) => {
    const id = c.req.valid("param").id;
    const caller = getRunsCaller(c);
    const run = caller
      ? await caller.orchestration.getRun({ runId: id })
      : FALLBACK_RUNS.find((candidate) => candidate.id === id);
    if (!run) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(AgentRunSchema.parse(toJsonDates(run)), 200);
  });
}

function getRunsCaller(c: { get(key: string): unknown }): RunsCaller | undefined {
  const trpc = c.get("trpc") as RunsCaller | undefined;
  return trpc?.orchestration ? trpc : undefined;
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
