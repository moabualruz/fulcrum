import type { EntityManager } from "@mikro-orm/postgresql";
import { AuditEvent } from "../../db/entities/audit/AuditEvent.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import type { AppContext, AuditEventDto } from "./types.ts";

export async function queryAuditEvents(em: EntityManager, ctx: AppContext, input: { subjectKind?: string } = {}): Promise<{ items: AuditEventDto[]; total: number }> {
  const items = (await em.find(AuditEvent, { org: ctx.orgId, ...(input.subjectKind ? { subjectKind: input.subjectKind } : {}) } as never, { orderBy: { createdAt: "DESC", id: "ASC" } })).map(serializeAuditEvent);
  return { items, total: items.length };
}

export async function getAuditEvent(em: EntityManager, ctx: AppContext, id: string): Promise<AuditEventDto> {
  const row = await em.findOne(AuditEvent, { id } as never);
  if (!row) throw new AppNotFoundError(`Audit event not found: ${id}`);
  if (row.org.id !== ctx.orgId) throw new AppForbiddenError("Audit event is outside org scope.");
  return serializeAuditEvent(row);
}

export function serializeAuditEvent(row: AuditEvent): AuditEventDto {
  return { id: row.id, orgId: row.org.id, projectId: row.projectId, action: row.action, subjectKind: row.subjectKind, subjectId: row.subjectId };
}
