/**
 * P13#06 — REST routes for the audit domain.
 * GET /audit, GET /audit/export → delegates to audit.query tRPC.
 * Audit export: streaming CSV or JSON response.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

// ── Schemas ──────────────────────────────────────────────────────────────────

const AuditEventSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    kind: z.string(),
    actorId: z.string(),
    resourceId: z.string().optional(),
    occurredAt: z.string().datetime(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("AuditEvent");

const AuditQuerySchema = z.object({
  kind: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
});

const AuditExportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
});

// ── Stub store ────────────────────────────────────────────────────────────────

const FIXED_ORG = "11111111-1111-4111-8111-111111111111";

const STUB_EVENTS: z.infer<typeof AuditEventSchema>[] = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    orgId: FIXED_ORG,
    kind: "task.created",
    actorId: "user-1",
    occurredAt: "2026-01-15T10:00:00.000Z",
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    orgId: FIXED_ORG,
    kind: "doc.updated",
    actorId: "user-2",
    occurredAt: "2026-02-01T09:00:00.000Z",
  },
];

function filterEvents(
  events: z.infer<typeof AuditEventSchema>[],
  query: z.infer<typeof AuditQuerySchema>,
): z.infer<typeof AuditEventSchema>[] {
  return events.filter((e) => {
    if (query.kind && e.kind !== query.kind) return false;
    if (query.since && e.occurredAt < query.since) return false;
    if (query.until && e.occurredAt > query.until) return false;
    return true;
  });
}

function eventsToCsv(events: z.infer<typeof AuditEventSchema>[]): string {
  const header = "id,orgId,kind,actorId,resourceId,occurredAt";
  const rows = events.map(
    (e) =>
      `${e.id},${e.orgId},${e.kind},${e.actorId},${e.resourceId ?? ""},${e.occurredAt}`,
  );
  return [header, ...rows].join("\n");
}

// ── Routes ────────────────────────────────────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/audit",
  tags: ["audit"],
  summary: "Query audit events",
  request: { query: AuditQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(AuditEventSchema) } },
      description: "Audit events",
    },
  },
});

const exportRoute = createRoute({
  method: "get",
  path: "/audit/export",
  tags: ["audit"],
  summary: "Export audit events as CSV or JSON",
  request: { query: AuditExportQuerySchema },
  responses: {
    200: {
      content: {
        "text/csv": { schema: z.string() },
        "application/json": { schema: z.array(AuditEventSchema) },
      },
      description: "Audit export",
    },
  },
});

export function registerAuditRoutes(api: OpenAPIHono): void {
  api.openapi(listRoute, (c) => {
    const query = c.req.valid("query");
    return c.json(filterEvents(STUB_EVENTS, query), 200);
  });

  api.openapi(exportRoute, (c) => {
    const { format } = c.req.valid("query");
    const events = STUB_EVENTS;
    if (format === "csv") {
      const csv = eventsToCsv(events);
      return new Response(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="audit.csv"',
        },
      });
    }
    return c.json(events, 200);
  });
}
