import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "../../db/entities/auth/Org.ts";
import { AuditEvent } from "../../db/entities/audit/AuditEvent.ts";
import { EventRetentionPolicy } from "../../db/entities/notifications/EventRetentionPolicy.ts";
import { AppValidationError } from "../errors.ts";
import { findRetentionPolicy, serializeAuditEvent, serializeRetentionPolicy } from "./queries.ts";
import type { AppContext, AuditEventDto, RecordAuditEventInput, RetentionPolicyDto } from "./types.ts";

export async function recordAuditEvent(
  em: EntityManager,
  ctx: AppContext,
  input: RecordAuditEventInput,
): Promise<AuditEventDto> {
  if (!input.action || !input.subjectKind || !input.subjectId) {
    throw new AppValidationError("Audit action, subjectKind, and subjectId are required.");
  }
  return await em.transactional(async (txEm) => {
    const row = txEm.create(AuditEvent, {
      org: txEm.getReference(Org, ctx.orgId),
      projectId: ctx.projectId ?? "00000000-0000-4000-8000-000000000000",
      actorId: ctx.userId ?? "system",
      action: input.action,
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      payload: input.payload ?? {},
    });
    txEm.persist(row);
    await txEm.flush();
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
    policy = em.create(EventRetentionPolicy, {
      org: em.getReference(Org, input.orgId),
      projectId,
      retainDays: input.retainDays,
    });
    em.persist(policy);
  } else {
    policy.retainDays = input.retainDays;
  }

  await em.flush();
  await em.populate(policy, ["org"]);
  return serializeRetentionPolicy(policy);
}
