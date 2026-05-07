import type { EntityManager } from "@mikro-orm/postgresql";

import { AuditEvent } from "../../db/entities/audit/AuditEvent.ts";
import { Event } from "../../db/entities/core/Event.ts";
import { EventRetentionPolicy } from "../../db/entities/notifications/EventRetentionPolicy.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import type {
  AppContext,
  AuditEventDto,
  AuditExportResult,
  AuditFilter,
  AuditQueryInput,
  AuditQueryResult,
  RetentionPolicyDto,
} from "./types.ts";

export async function queryAuditEvents(
  em: EntityManager,
  ctx: AppContext,
  input: AuditQueryInput = {},
): Promise<AuditQueryResult> {
  const orgId = input.orgId ?? ctx.orgId;
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const rows = await em.find(Event, buildEventWhere(orgId, input), {
    populate: ["org", "user"],
    orderBy: { createdAt: "DESC" },
  });
  const legacyRows = await em.find(AuditEvent, {
    org: orgId,
    ...(input.subjectKind ? { subjectKind: input.subjectKind } : {}),
  } as never, { orderBy: { createdAt: "DESC", id: "ASC" } });
  const filtered = [
    ...rows.filter((event) => projectMatches(event, input.projectId)).map(serializeEvent),
    ...legacyRows.filter((event) => !input.projectId || event.projectId === input.projectId).map(serializeAuditEvent),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));

  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit,
    offset,
  };
}

export async function getAuditEvent(em: EntityManager, ctx: AppContext, id: string): Promise<AuditEventDto> {
  const row = await em.findOne(AuditEvent, { id } as never);
  if (!row) throw new AppNotFoundError(`Audit event not found: ${id}`);
  if (row.org.id !== ctx.orgId) throw new AppForbiddenError("Audit event is outside org scope.");
  return serializeAuditEvent(row);
}

export async function exportAuditEvents(
  em: EntityManager,
  ctx: AppContext,
  input: (AuditFilter & { format?: "csv" | "json" }) = {},
): Promise<AuditExportResult> {
  const result = await queryAuditEvents(em, ctx, {
    ...input,
    limit: 100_000,
    offset: 0,
  });

  if (result.total > 100_000) return { jobId: crypto.randomUUID() };
  if (input.format === "csv") return { format: "csv", csv: toCsv(result.items) };
  return { format: "json", rows: result.items };
}

export async function getRetentionPolicy(
  em: EntityManager,
  ctx: AppContext,
  input: { orgId?: string; projectId?: string | null } = {},
): Promise<RetentionPolicyDto | null> {
  const policy = await findRetentionPolicy(em, input.orgId ?? ctx.orgId, input.projectId ?? null);
  return policy ? serializeRetentionPolicy(policy) : null;
}

export async function listRetentionPolicies(
  em: EntityManager,
  ctx: AppContext,
  input: { orgId?: string; projectId?: string | null } = {},
): Promise<RetentionPolicyDto[]> {
  const rows = await em.find(EventRetentionPolicy, {
    org: input.orgId ?? ctx.orgId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
  }, {
    populate: ["org"],
    orderBy: { projectId: "ASC" },
  });
  return rows.map(serializeRetentionPolicy);
}

export async function findRetentionPolicy(
  em: EntityManager,
  orgId: string,
  projectId: string | null,
): Promise<EventRetentionPolicy | null> {
  return em.findOne(EventRetentionPolicy, { org: orgId, projectId }, { populate: ["org"] });
}

export function serializeEvent(event: Event): AuditEventDto {
  return {
    id: event.id,
    orgId: event.org.id,
    userId: event.user?.id ?? null,
    verb: event.verb,
    subjectKind: event.subjectKind,
    subjectId: event.subjectId ?? null,
    payload: event.payload ?? null,
    createdAt: event.createdAt,
  };
}

export function serializeAuditEvent(event: AuditEvent): AuditEventDto {
  return {
    id: event.id,
    orgId: event.org.id,
    userId: event.actorId,
    verb: event.action,
    subjectKind: event.subjectKind,
    subjectId: event.subjectId,
    payload: event.payload,
    createdAt: event.createdAt,
  };
}

export function serializeRetentionPolicy(policy: EventRetentionPolicy): RetentionPolicyDto {
  return {
    id: policy.id,
    orgId: policy.org.id,
    projectId: policy.projectId ?? null,
    retainDays: policy.retainDays,
  };
}

function buildEventWhere(orgId: string, filter: AuditFilter = {}) {
  const range = filter.dateRange ?? defaultDateRange();
  const createdAt: Record<string, Date> = {};
  if (range.from) createdAt.$gte = range.from;
  if (range.to) createdAt.$lte = range.to;

  return {
    org: orgId,
    ...(filter.userId ? { user: filter.userId } : {}),
    ...(filter.subjectKind ? { subjectKind: filter.subjectKind } : {}),
    ...(filter.verb ? { verb: filter.verb } : {}),
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
  };
}

function defaultDateRange(): { from: Date; to?: Date } {
  return { from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
}

function projectMatches(event: Event, projectId: string | undefined): boolean {
  if (!projectId) return true;
  return event.payload?.["projectId"] === projectId;
}

function csvEscape(value: unknown): string {
  const text = value instanceof Date
    ? value.toISOString()
    : typeof value === "string"
      ? value
      : JSON.stringify(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function toCsv(rows: AuditEventDto[]): string {
  const headers = ["id", "org_id", "user_id", "verb", "subject_kind", "subject_id", "payload", "created_at"];
  const lines = rows.map((row) => [
    row.id,
    row.orgId,
    row.userId ?? "",
    row.verb,
    row.subjectKind,
    row.subjectId ?? "",
    row.payload ?? {},
    row.createdAt,
  ].map(csvEscape).join(","));
  return [headers.join(","), ...lines].join("\n");
}
