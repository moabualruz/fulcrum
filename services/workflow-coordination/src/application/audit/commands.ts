import type { EntityManager } from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { AuditEvent } from "@workflow-coordination/infrastructure/database/entities/audit/AuditEvent.ts";
import { EventRetentionPolicy } from "@notification-center/infrastructure/database/entities/notifications/EventRetentionPolicy.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { findRetentionPolicy, serializeAuditEvent, serializeRetentionPolicy } from "@workflow-coordination/application/audit/queries.ts";
import type { AppContext, AuditEventDto, RecordAuditEventInput, RetentionPolicyDto } from "@workflow-coordination/domain/audit.ts";

export async function recordAuditEvent(
  em: EntityManager,
  ctx: AppContext,
  input: RecordAuditEventInput,
): Promise<AuditEventDto> {
  if (!input.action || !input.subjectKind || !input.subjectId) {
    throw new AppValidationError("Audit action, subjectKind, and subjectId are required.");
  }
  return await em.transaction(async (txEm: EntityManager) => {
    const row = await txEm.save(AuditEvent, {
      org: { id: ctx.orgId } as Org,
      projectId: ctx.projectId ?? "00000000-0000-4000-8000-000000000000",
      actorId: ctx.userId ?? "system",
      action: input.action,
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      payload: input.payload ?? {},
    });
    return serializeAuditEvent(row);
  });
}

export async function setRetentionPolicy(
  em: EntityManager,
  _ctx: AppContext,
  input: { orgId: string; projectId?: string | null; retainDays: number },
): Promise<RetentionPolicyDto> {
  const projectId = input.projectId ?? null;
  let policy = await findRetentionPolicy(em, input.orgId, projectId);

  if (!policy) {
    policy = await em.save(EventRetentionPolicy, {
      org: { id: input.orgId } as Org,
      projectId,
      retainDays: input.retainDays,
    });
  } else {
    policy.retainDays = input.retainDays;
    await em.save(policy);
  }

  return serializeRetentionPolicy(policy);
}
