import { randomUUID } from "node:crypto";

import { DataSource, MoreThanOrEqual } from "typeorm";

import {
  OrganizationMemberEntity,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import {
  FulcrumErrorLogEntity,
  type FulcrumErrorLog,
} from "@platform-core/infrastructure/database/error-log.entities.ts";

export interface ErrorLogPublicRow {
  id: string;
  orgId: string;
  userId: string | null;
  occurredAt: string | null;
  os: string | null;
  arch: string | null;
  bunVersion: string | null;
  fulcrumVersion: string | null;
  recentCliCommand: string | null;
  recentProcedure: string | null;
  errorMessage: string;
  stackTrace: string | null;
  context: Record<string, unknown>;
}

export class ErrorLogPermissionError extends Error {}

export class ErrorLogStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: {
    orgId: string;
    userId: string;
    limit?: number;
    since?: Date;
  }): Promise<ErrorLogPublicRow[]> {
    await this.requireAdminAccess(input);
    const rows = await this.errorLogRepository().find({
      where: {
        orgId: input.orgId,
        ...(input.since ? { occurredAt: MoreThanOrEqual(input.since) } : {}),
      },
      order: { occurredAt: "DESC", id: "ASC" },
      take: normalizeLimit(input.limit),
    });
    return rows.map(serializeErrorLog);
  }

  async get(input: { orgId: string; userId: string; id: string }): Promise<ErrorLogPublicRow | null> {
    await this.requireAdminAccess(input);
    const row = await this.errorLogRepository().findOneBy({ orgId: input.orgId, id: input.id });
    return row ? serializeErrorLog(row) : null;
  }

  async clear(input: { orgId: string; userId: string }): Promise<number> {
    await this.requireAdminAccess(input);
    const result = await this.errorLogRepository().delete({ orgId: input.orgId });
    return Number(result.affected ?? 0);
  }

  async record(input: {
    orgId: string;
    userId?: string | null;
    errorMessage: string;
    stackTrace?: string | null;
    context?: Record<string, unknown>;
    occurredAt?: Date;
    os?: string | null;
    arch?: string | null;
    bunVersion?: string | null;
    fulcrumVersion?: string | null;
    recentCliCommand?: string | null;
    recentProcedure?: string | null;
  }): Promise<ErrorLogPublicRow> {
    const saved = await this.errorLogRepository().save({
      id: randomUUID(),
      orgId: input.orgId,
      userId: input.userId ?? null,
      errorMessage: input.errorMessage,
      stackTrace: input.stackTrace ?? null,
      context: input.context ?? {},
      occurredAt: input.occurredAt,
      os: input.os ?? null,
      arch: input.arch ?? null,
      bunVersion: input.bunVersion ?? null,
      fulcrumVersion: input.fulcrumVersion ?? null,
      recentCliCommand: input.recentCliCommand ?? null,
      recentProcedure: input.recentProcedure ?? null,
    });
    return serializeErrorLog(saved);
  }

  private async requireAdminAccess(input: { orgId: string; userId: string }): Promise<void> {
    const membership = await this.dataSource.getRepository(OrganizationMemberEntity).findOneBy({
      orgId: input.orgId,
      userId: input.userId,
    });
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new ErrorLogPermissionError("Only organization owners and admins can read error logs.");
    }
  }

  private errorLogRepository() {
    return this.dataSource.getRepository<FulcrumErrorLog>(FulcrumErrorLogEntity);
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? 0) || !limit || limit < 1) return 50;
  return Math.min(Math.trunc(limit), 200);
}

function serializeErrorLog(row: FulcrumErrorLog): ErrorLogPublicRow {
  return {
    id: row.id,
    orgId: row.orgId,
    userId: row.userId ?? null,
    occurredAt: dateString(row.occurredAt),
    os: row.os ?? null,
    arch: row.arch ?? null,
    bunVersion: row.bunVersion ?? null,
    fulcrumVersion: row.fulcrumVersion ?? null,
    recentCliCommand: row.recentCliCommand ?? null,
    recentProcedure: row.recentProcedure ?? null,
    errorMessage: row.errorMessage,
    stackTrace: row.stackTrace ?? null,
    context: row.context ?? {},
  };
}

function dateString(value: Date | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}
