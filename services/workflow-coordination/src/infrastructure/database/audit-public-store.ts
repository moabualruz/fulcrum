import { randomUUID } from "node:crypto";
import { Between, DataSource, IsNull, LessThanOrEqual, MoreThanOrEqual, type FindOptionsWhere } from "typeorm";

import {
  type WorkflowAuditEvent,
  WorkflowAuditEventEntity,
  type WorkflowAuditRetentionPolicy,
  WorkflowAuditRetentionPolicyEntity,
} from "@workflow-coordination/infrastructure/database/audit-log.entities.ts";

export interface AuditPublicRow {
  id: string;
  orgId: string;
  projectId: string | null;
  userId: string | null;
  verb: string;
  subjectKind: string;
  subjectId: string | null;
  payload: Record<string, unknown>;
  traceId: string | null;
  createdAt: string;
}

export interface AuditRetentionPolicyPublicRow {
  id: string;
  orgId: string;
  projectId: string | null;
  retainDays: number;
  createdAt: string;
  updatedAt: string;
}

export class AuditPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async queryAuditEvents(input: {
    orgId: string;
    projectId?: string;
    userId?: string;
    kind?: string;
    subjectId?: string;
    verb?: string;
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: AuditPublicRow[]; total: number }> {
    const where: FindOptionsWhere<WorkflowAuditEvent> = {
      orgId: input.orgId,
    };
    if (input.projectId) where.projectId = input.projectId;
    if (input.userId) where.userId = input.userId;
    if (input.kind) where.subjectKind = input.kind;
    if (input.subjectId) where.subjectId = input.subjectId;
    if (input.verb) where.verb = input.verb;
    if (input.since && input.until) {
      where.createdAt = Between(new Date(input.since), new Date(input.until));
    } else if (input.since) {
      where.createdAt = MoreThanOrEqual(new Date(input.since));
    } else if (input.until) {
      where.createdAt = LessThanOrEqual(new Date(input.until));
    }

    const [events, total] = await this.repository().findAndCount({
      where,
      order: { createdAt: "DESC", id: "ASC" },
      take: input.limit ?? 50,
      skip: input.offset ?? 0,
    });

    return {
      data: events.map(toPublicRow),
      total,
    };
  }

  async getRetentionPolicy(input: {
    orgId: string;
    projectId?: string | null;
  }): Promise<AuditRetentionPolicyPublicRow | null> {
    const policy = await this.retentionRepository().findOne({
      where: retentionPolicyWhere(input),
    });
    return policy ? toRetentionPolicyPublicRow(policy) : null;
  }

  async listRetentionPolicies(input: {
    orgId: string;
    projectId?: string | null;
  }): Promise<AuditRetentionPolicyPublicRow[]> {
    const where: FindOptionsWhere<WorkflowAuditRetentionPolicy> = {
      orgId: input.orgId,
    };
    if (input.projectId !== undefined && input.projectId !== null) {
      where.projectId = input.projectId;
    }

    const policies = await this.retentionRepository().find({
      where,
      order: { projectId: "ASC", createdAt: "ASC", id: "ASC" },
    });
    return policies.map(toRetentionPolicyPublicRow);
  }

  async setRetentionPolicy(input: {
    orgId: string;
    projectId?: string | null;
    retainDays: number;
  }): Promise<AuditRetentionPolicyPublicRow> {
    const repository = this.retentionRepository();
    const existing = await repository.findOne({ where: retentionPolicyWhere(input) });
    const now = new Date();
    const policy = existing ?? repository.create({
      id: randomUUID(),
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      createdAt: now,
    });
    policy.retainDays = input.retainDays;
    policy.updatedAt = now;

    return toRetentionPolicyPublicRow(await repository.save(policy));
  }

  private repository() {
    return this.dataSource.getRepository(WorkflowAuditEventEntity);
  }

  private retentionRepository() {
    return this.dataSource.getRepository(WorkflowAuditRetentionPolicyEntity);
  }
}

function toPublicRow(event: WorkflowAuditEvent): AuditPublicRow {
  return {
    id: event.id,
    orgId: event.orgId,
    projectId: event.projectId,
    userId: event.userId,
    verb: event.verb,
    subjectKind: event.subjectKind,
    subjectId: event.subjectId,
    payload: event.payload,
    traceId: event.traceId,
    createdAt: (event.createdAt ?? new Date(0)).toISOString(),
  };
}

function retentionPolicyWhere(input: {
  orgId: string;
  projectId?: string | null;
}): FindOptionsWhere<WorkflowAuditRetentionPolicy> {
  return {
    orgId: input.orgId,
    projectId: input.projectId ?? IsNull(),
  };
}

function toRetentionPolicyPublicRow(policy: WorkflowAuditRetentionPolicy): AuditRetentionPolicyPublicRow {
  return {
    id: policy.id,
    orgId: policy.orgId,
    projectId: policy.projectId,
    retainDays: policy.retainDays,
    createdAt: (policy.createdAt ?? new Date(0)).toISOString(),
    updatedAt: (policy.updatedAt ?? new Date(0)).toISOString(),
  };
}
