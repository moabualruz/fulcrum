/**
 * Real audit routes — delegates to the application layer.
 */

import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { ApiEnv } from "../auth.ts";
import type { KernelAuditApplication } from "../application.ts";

const ErrorResponse = z.object({ error: z.string() });
const AuditQueryParams = z.object({
  kind: z.string().optional(),
  verb: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
const AuditListResponse = z.object({
  data: z.array(z.unknown()),
  total: z.number().int().nonnegative(),
});

const auditQueryRoute = createRoute({
  method: "get",
  path: "/audit",
  tags: ["audit"],
  summary: "Query audit events",
  request: { query: AuditQueryParams },
  responses: {
    200: {
      content: { "application/json": { schema: AuditListResponse } },
      description: "Audit events",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

export function registerKernelAuditRoutes(
  api: OpenAPIHono<ApiEnv>,
  options: { application?: KernelAuditApplication } = {},
): void {
  api.openapi(auditQueryRoute, async (c) => {
    const application = options.application ?? c.get("application")?.audit;
    if (!application) return c.json({ data: [], total: 0 }, 200);
    const orgId = c.get("orgId");
    const q = c.req.valid("query");
    const result = await application.queryAuditEvents({
      orgId,
      kind: q.kind,
      verb: q.verb,
      since: q.since,
      until: q.until,
      limit: q.limit,
      offset: q.offset,
    });
    return c.json(result as never, 200);
  });
}
