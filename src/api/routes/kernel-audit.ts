/**
 * Real audit routes — delegates to the application layer.
 */

import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { EntityManager } from "@mikro-orm/postgresql";

import { queryAuditEvents } from "../../application/audit/queries.ts";
import { appErrorToHttpResponse } from "../../application/error-mapping.ts";
import { AppInvariantError } from "../../application/errors.ts";
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
  data: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
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
    const orgId = c.get("orgId");
    const q = c.req.valid("query");
    return await mapHttpError(c, async () => {
      if (application) {
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
      }
      const result = await queryAuditEvents(resolveEntityManager(c), { orgId, userId: c.get("userId") }, {
        subjectKind: q.kind,
        verb: q.verb,
        ...(q.since || q.until
          ? { dateRange: { from: q.since ? new Date(q.since) : undefined, to: q.until ? new Date(q.until) : undefined } }
          : {}),
        limit: q.limit,
        offset: q.offset,
      });
      return c.json({ data: result.items, total: result.total } as never, 200);
    }) as never;
  });
}

function resolveEntityManager(c: { get(key: string): unknown }): EntityManager {
  const db = c.get("db");
  if (db && typeof db === "object" && "transactional" in db) return db as EntityManager;
  if (db && typeof db === "object" && "em" in db) {
    const entityManager = (db as { em?: unknown }).em;
    if (entityManager && typeof entityManager === "object" && "transactional" in entityManager) {
      return entityManager as EntityManager;
    }
  }
  throw new AppInvariantError("EntityManager could not be resolved.");
}

async function mapHttpError(c: any, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    const mapped = appErrorToHttpResponse(error);
    return c.json(mapped.body, mapped.status as never);
  }
}
