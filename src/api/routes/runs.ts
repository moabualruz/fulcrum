/**
 * P13#06 — REST routes for the agent_runs domain.
 * GET /runs, GET /runs/:id → delegates to agent_runs.list|get tRPC.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

// ── Schemas ──────────────────────────────────────────────────────────────────

const RunStatusSchema = z
  .enum(["queued", "running", "completed", "failed", "cancelled"])
  .openapi("RunStatus");

const AgentRunSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    status: RunStatusSchema,
    agentId: z.string(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().optional(),
  })
  .openapi("AgentRun");

const RunsQuerySchema = z.object({
  status: RunStatusSchema.optional(),
});

const RunIdParamSchema = z.object({ id: z.string().uuid() });

const ErrorSchema = z
  .object({ error: z.string(), code: z.string() })
  .openapi("RunsError");

// ── Stub store ────────────────────────────────────────────────────────────────

const FIXED_ORG = "11111111-1111-4111-8111-111111111111";

function makeRunStore(): Map<string, z.infer<typeof AgentRunSchema>> {
  return new Map([
    [
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        orgId: FIXED_ORG,
        status: "completed" as const,
        agentId: "agent-1",
        startedAt: "2026-01-10T08:00:00.000Z",
        finishedAt: "2026-01-10T08:05:00.000Z",
      },
    ],
    [
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef",
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef",
        orgId: FIXED_ORG,
        status: "running" as const,
        agentId: "agent-2",
        startedAt: "2026-02-01T12:00:00.000Z",
      },
    ],
  ]);
}

// ── Routes ────────────────────────────────────────────────────────────────────

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

export function registerRunsRoutes(api: OpenAPIHono): void {
  const store = makeRunStore();

  api.openapi(listRoute, (c) => {
    const { status } = c.req.valid("query");
    let runs = [...store.values()];
    if (status) {
      runs = runs.filter((r) => r.status === status);
    }
    return c.json(runs, 200);
  });

  api.openapi(getRoute, (c) => {
    const { id } = c.req.valid("param");
    const run = store.get(id);
    if (!run) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(run, 200);
  });
}
