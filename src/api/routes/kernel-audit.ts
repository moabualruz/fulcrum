/**
 * Real audit routes — delegates to product-kernel store.
 */

import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { ApiEnv } from "../auth.ts";
import { queryAuditEvents } from "../../product-kernel/store/audit.ts";
import * as S from "../../product-kernel/api/schemas.ts";

const auditQueryRoute = createRoute({
  method: "get",
  path: "/audit",
  tags: ["audit"],
  summary: "Query audit events",
  request: { query: S.AuditQueryParams },
  responses: {
    200: {
      content: { "application/json": { schema: S.AuditListResponse } },
      description: "Audit events",
    },
    401: {
      content: { "application/json": { schema: S.ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

export function registerKernelAuditRoutes(api: OpenAPIHono<ApiEnv>): void {
  api.openapi(auditQueryRoute, async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId");
    const q = c.req.valid("query");
    const result = await queryAuditEvents(db, {
      orgId,
      kind: q.kind,
      verb: q.verb,
      since: q.since,
      until: q.until,
      limit: q.limit,
      offset: q.offset,
    });
    return c.json({ data: result.items, total: result.total } as any, 200);
  });
}
