import type { EntityManager } from "typeorm";
import { Between, LessThanOrEqual, MoreThanOrEqual } from "typeorm";

import { AuditEvent } from "@workflow-coordination/infrastructure/database/entities/audit/AuditEvent.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { EventRetentionPolicy } from "@notification-center/infrastructure/database/entities/notifications/EventRetentionPolicy.ts";
import { AppForbiddenError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import type {
  AppContext,
  AuditEventDto,
  AuditExportResult,
  AuditFilter,
  AuditQueryInput,
  AuditQueryResult,
  RetentionPolicyDto,
} from "@workflow-coordination/domain/audit.ts";

type AuditRouteQueryInput = AuditQueryInput & {
  actor?: string;
  since?: string;
  until?: string;
};

export interface EventRow {
  id: string;
  org_id: string;
  project_id: string | null;
  actor: string;
  subject_kind: string;
  subject_id: string;
  verb: string;
  causation_id: string | null;
  field_name: string | null;
  before: unknown;
  after: unknown;
  payload: Record<string, unknown>;
  created_at: string;
}

export async function queryAuditEvents(
  em: EntityManager,
  ctx: AppContext,
  input: AuditRouteQueryInput = {},
): Promise<AuditQueryResult> {
  const orgId = input.orgId ?? ctx.orgId;
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

  const eventWhere = buildEventWhere(orgId, input);
  const rows = await em.find(Event, {
    where: eventWhere as never,
    relations: ["org", "user"],
    order: { createdAt: "DESC" },
  });

  const auditWhere: Record<string, unknown> = { org: { id: orgId } };
  if (input.subjectKind) auditWhere["subjectKind"] = input.subjectKind;
  const legacyRows = await em.find(AuditEvent, {
    where: auditWhere as never,
    order: { createdAt: "DESC", id: "ASC" },
  });

  const filtered = [
    ...rows.filter((event) => projectMatches(event, input.projectId)).map(serializeEvent),
    ...legacyRows.filter((event) => !input.projectId || event.projectId === input.projectId).map(serializeAuditEvent),
  ]
    .filter((event) => !input.actor || event.userId === input.actor)
    .filter((event) => !input.verb || event.verb === input.verb)
    .filter((event) => !input.since || event.createdAt >= new Date(input.since))
    .filter((event) => !input.until || event.createdAt <= new Date(input.until))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));

  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit,
    offset,
  };
}

export async function queryAuditEventRows(
  em: EntityManager,
  ctx: AppContext,
  input: AuditRouteQueryInput = {},
): Promise<{ rows: EventRow[]; total: number }> {
  const result = await queryAuditEvents(em, ctx, input);
  return {
    rows: result.items.map(toEventRow),
    total: result.total,
  };
}

export async function getAuditEvent(em: EntityManager, ctx: AppContext, id: string): Promise<AuditEventDto> {
  const row = await em.findOne(AuditEvent, { where: { id } as never });
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
  const where: Record<string, unknown> = { org: { id: input.orgId ?? ctx.orgId } };
  if (input.projectId !== undefined) where["projectId"] = input.projectId;
  const rows = await em.find(EventRetentionPolicy, {
    where: where as never,
    relations: ["org"],
    order: { projectId: "ASC" },
  });
  return rows.map(serializeRetentionPolicy);
}

export async function findRetentionPolicy(
  em: EntityManager,
  orgId: string,
  projectId: string | null,
): Promise<EventRetentionPolicy | null> {
  return em.findOne(EventRetentionPolicy, {
    where: { org: { id: orgId }, projectId } as never,
    relations: ["org"],
  });
}

export function serializeEvent(event: Event): AuditEventDto {
  const payload = event.payload ?? {};
  return {
    id: event.id,
    orgId: event.org.id,
    userId: event.user?.id ?? null,
    verb: event.verb,
    subjectKind: event.subjectKind,
    subjectId: event.subjectId ?? null,
    causationId: payloadCausationId(payload),
    fieldName: event.fieldName ?? null,
    before: event.fromValue ?? payload["before"],
    after: event.toValue ?? payload["after"],
    payload,
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

function buildEventWhere(orgId: string, filter: AuditRouteQueryInput = {}) {
  const range = filter.dateRange ?? {
    from: filter.since ? new Date(filter.since) : defaultDateRange().from,
    to: filter.until ? new Date(filter.until) : undefined,
  };

  const where: Record<string, unknown> = { org: { id: orgId } };
  if (filter.userId) where["user"] = { id: filter.userId };
  if (filter.subjectKind) where["subjectKind"] = filter.subjectKind;
  if (filter.verb) where["verb"] = filter.verb;
  if (range.from && range.to) {
    where["createdAt"] = Between(range.from, range.to);
  } else if (range.from) {
    where["createdAt"] = MoreThanOrEqual(range.from);
  } else if (range.to) {
    where["createdAt"] = LessThanOrEqual(range.to);
  }

  return where;
}

function defaultDateRange(): { from: Date; to?: Date } {
  return { from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
}

function projectMatches(event: Event, projectId: string | undefined): boolean {
  if (!projectId) return true;
  return event.payload?.["projectId"] === projectId;
}

function payloadProjectId(payload: Record<string, unknown> | null | undefined): string | null {
  const projectId = payload?.["projectId"];
  return typeof projectId === "string" ? projectId : null;
}

function payloadCausationId(payload: Record<string, unknown> | null | undefined): string | null {
  const causationId = payload?.["causation_id"] ?? payload?.["causationId"];
  return typeof causationId === "string" && causationId.trim() ? causationId : null;
}

function toEventRow(event: AuditEventDto): EventRow {
  return {
    id: event.id,
    org_id: event.orgId,
    project_id: payloadProjectId(event.payload),
    actor: event.userId ?? "system",
    subject_kind: event.subjectKind,
    subject_id: event.subjectId ?? "",
    verb: event.verb,
    causation_id: event.causationId ?? null,
    field_name: event.fieldName ?? null,
    before: event.before ?? null,
    after: event.after ?? null,
    payload: event.payload ?? {},
    created_at: event.createdAt.toISOString(),
  };
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
  const headers = ["id", "org_id", "user_id", "verb", "subject_kind", "subject_id", "causation_id", "field_name", "before", "after", "payload", "created_at"];
  const lines = rows.map((row) => [
    row.id,
    row.orgId,
    row.userId ?? "",
    row.verb,
    row.subjectKind,
    row.subjectId ?? "",
    row.causationId ?? "",
    row.fieldName ?? "",
    row.before ?? "",
    row.after ?? "",
    row.payload ?? {},
    row.createdAt,
  ].map(csvEscape).join(","));
  return [headers.join(","), ...lines].join("\n");
}

export function eventsToCsv(events: EventRow[]): string {
  const headers = ["id", "org_id", "project_id", "actor", "subject_kind", "subject_id", "verb", "causation_id", "field_name", "before", "after", "payload", "created_at"];
  const lines = events.map((event) => [
    event.id,
    event.org_id,
    event.project_id ?? "",
    event.actor,
    event.subject_kind,
    event.subject_id,
    event.verb,
    event.causation_id ?? "",
    event.field_name ?? "",
    event.before ?? "",
    event.after ?? "",
    event.payload,
    event.created_at,
  ].map(csvEscape).join(","));
  return [headers.join(","), ...lines].join("\n") + "\n";
}

export function eventsToJson(events: EventRow[]): string {
  return JSON.stringify(events);
}
