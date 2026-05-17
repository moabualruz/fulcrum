import type { EntityManager } from "typeorm";
import { readFile } from "node:fs/promises";

import { assertArtifactPathInRoot, resolveArtifactStoreRoot } from "@workflow-coordination/infrastructure/artifacts/storage.ts";
import { Artifact } from "@execution-orchestration/infrastructure/database/entities/sandbox/Artifact.ts";
import type { ArtifactDetail } from "@workflow-coordination/application/artifact-service-actions.ts";
import { AppForbiddenError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import { ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import type { AppContext, ArtifactDto } from "@workflow-coordination/domain/artifact.ts";

export async function listArtifacts(em: EntityManager, ctx: AppContext): Promise<ArtifactDto[]> {
  const artifacts = await em.find(Artifact, { where: { org: { id: ctx.orgId } } as never, order: { createdAt: "DESC", id: "ASC" } });
  return artifacts.map(serializeArtifact);
}

export interface ArtifactRow {
  id: string;
  org_id: string;
  project_id: string | null;
  run_id: string | null;
  task_id: string | null;
  kind: string;
  title: string;
  body_path: string | null;
  sha256: string | null;
  size: number | null;
  mime: string | null;
  archived: boolean;
  created_at: string;
}

export interface ArtifactStats {
  totalBytes: number;
  count: number;
}

export interface ArtifactRowFilter {
  projectId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  mime?: string | null;
  kind?: string | null;
  includeArchived?: boolean;
}

export async function listArtifactRows(
  em: EntityManager,
  ctx: AppContext,
  filter: ArtifactRowFilter = {},
): Promise<ArtifactRow[]> {
  const columns = await artifactColumns(em);
  const projectExpr = columns.has("project_id") ? "a.project_id" : "t.project_id";
  const runExpr = columns.has("run_id") ? "a.run_id" : "NULL::uuid";
  const taskExpr = columns.has("task_id") ? "a.task_id" : "NULL::uuid";
  const kindExpr = columns.has("kind") ? "a.kind" : "'file'::text";
  const titleExpr = columns.has("title") ? "a.title" : "a.filename";
  const bodyPathExpr = columns.has("body_path") ? "a.body_path" : "a.path";
  const shaExpr = columns.has("sha256") ? "a.sha256" : columns.has("checksum_sha256") ? "a.checksum_sha256" : "NULL::text";
  const sizeExpr = columns.has("size") ? "a.size" : columns.has("size_bytes") ? "a.size_bytes" : "NULL::bigint";
  const archivedExpr = columns.has("archived") ? "COALESCE(a.archived, false)" : "false";
  const joins = columns.has("task_id") ? "LEFT JOIN tasks t ON t.id = a.task_id" : "";
  const params: unknown[] = [ctx.orgId];
  const conditions = ["a.org_id = $1"];

  if (!filter.includeArchived && columns.has("archived")) {
    conditions.push("(a.archived = false OR a.archived IS NULL)");
  }
  if (filter.projectId) {
    params.push(filter.projectId);
    conditions.push(`${projectExpr} = $${params.length}`);
  }
  if (filter.runId && columns.has("run_id")) {
    params.push(filter.runId);
    conditions.push(`a.run_id = $${params.length}`);
  }
  if (filter.taskId && columns.has("task_id")) {
    params.push(filter.taskId);
    conditions.push(`a.task_id = $${params.length}`);
  }
  if (filter.mime) {
    params.push(filter.mime);
    conditions.push(`a.mime = $${params.length}`);
  }
  if (filter.kind && columns.has("kind")) {
    params.push(filter.kind);
    conditions.push(`a.kind = $${params.length}`);
  } else if (filter.kind && filter.kind !== "file") {
    return [];
  }

  const rows = await ormSqlConnection(em).execute<Array<{
    id: string;
    org_id: string;
    project_id: string | null;
    run_id: string | null;
    task_id: string | null;
    kind: string;
    title: string;
    body_path: string | null;
    sha256: string | null;
    size: number | string | bigint | null;
    mime: string | null;
    archived: boolean;
    created_at: string | Date;
  }>>(
    `SELECT a.id,
            a.org_id,
            ${projectExpr} AS project_id,
            ${runExpr} AS run_id,
            ${taskExpr} AS task_id,
            ${kindExpr} AS kind,
            ${titleExpr} AS title,
            ${bodyPathExpr} AS body_path,
            ${shaExpr} AS sha256,
            ${sizeExpr} AS size,
            a.mime,
            ${archivedExpr} AS archived,
            a.created_at
       FROM artifacts a
       ${joins}
      WHERE ${conditions.join(" AND ")}
      ORDER BY a.created_at DESC, a.id ASC`,
    params,
  );

  return rows.map((row) => ({
    ...row,
    archived: Boolean(row.archived),
    size: row.size === null ? null : Number(row.size),
    created_at: isoStamp(row.created_at),
  }));
}

export async function getArtifactStats(
  em: EntityManager,
  ctx: AppContext,
  projectId: string,
): Promise<ArtifactStats> {
  const columns = await artifactColumns(em);
  const projectExpr = columns.has("project_id") ? "a.project_id" : "t.project_id";
  const sizeExpr = columns.has("size") ? "a.size" : columns.has("size_bytes") ? "a.size_bytes" : "NULL::bigint";
  const joins = columns.has("task_id") ? "LEFT JOIN tasks t ON t.id = a.task_id" : "";
  const rows = await ormSqlConnection(em).execute<Array<{ total_bytes: number | string | null; count: number | string }>>(
    `SELECT COALESCE(SUM(${sizeExpr}), 0) AS total_bytes, COUNT(*)::int AS count
       FROM artifacts a
       ${joins}
      WHERE a.org_id = $1 AND ${projectExpr} = $2`,
    [ctx.orgId, projectId],
  );
  const row = rows[0] ?? { total_bytes: 0, count: 0 };
  return {
    totalBytes: Number(row.total_bytes ?? 0),
    count: Number(row.count),
  };
}

export async function getArtifact(em: EntityManager, ctx: AppContext, id: string): Promise<ArtifactDto> {
  const artifact = await em.findOne(Artifact, { where: { id } as never });
  if (!artifact) throw new AppNotFoundError(`Artifact not found: ${id}`);
  if (artifact.org.id !== ctx.orgId) throw new AppForbiddenError(`Artifact does not belong to org: ${ctx.orgId}`);
  return serializeArtifact(artifact);
}

export async function getArtifactDetail(em: EntityManager, ctx: AppContext, id: string): Promise<ArtifactDetail> {
  const columns = await artifactColumns(em);
  const projectExpr = columns.has("project_id") ? "a.project_id" : "t.project_id";
  const kindExpr = columns.has("kind") ? "a.kind" : "'file'::text";
  const titleExpr = columns.has("title") ? "a.title" : "a.filename";
  const bodyPathExpr = columns.has("body_path") ? "a.body_path" : "a.path";
  const shaExpr = columns.has("sha256") ? "a.sha256" : columns.has("checksum_sha256") ? "a.checksum_sha256" : "NULL::text";
  const sizeExpr = columns.has("size") ? "a.size" : columns.has("size_bytes") ? "a.size_bytes" : "NULL::bigint";
  const archivedExpr = columns.has("archived") ? "COALESCE(a.archived, false)" : "false";
  const rows = await ormSqlConnection(em).execute<Array<{
    id: string;
    org_id: string;
    project_id: string | null;
    run_id: string | null;
    task_id: string | null;
    kind: string;
    title: string;
    body_path: string | null;
    sha256: string | null;
    size: number | string | null;
    mime: string | null;
    archived: boolean;
    created_at: string | Date;
  }>>(
    `SELECT a.id,
            a.org_id,
            ${projectExpr} AS project_id,
            a.run_id,
            a.task_id,
            ${kindExpr} AS kind,
            ${titleExpr} AS title,
            ${bodyPathExpr} AS body_path,
            ${shaExpr} AS sha256,
            ${sizeExpr} AS size,
            a.mime,
            ${archivedExpr} AS archived,
            a.created_at
       FROM artifacts a
       LEFT JOIN tasks t ON t.id = a.task_id
      WHERE a.id = $1 AND a.org_id = $2`,
    [id, ctx.orgId],
  );
  const artifact = rows[0];
  if (!artifact) throw new AppNotFoundError(`Artifact not found: ${id}`);
  if (artifact.project_id && ctx.projectId && artifact.project_id !== ctx.projectId) {
    throw new AppNotFoundError(`Artifact not found: ${id}`);
  }
  const createdAt = artifact.created_at instanceof Date ? artifact.created_at : new Date(artifact.created_at);
  const bodyPath = artifact.body_path ? safeArtifactPath(artifact.body_path) : null;
  let content: string | null = null;
  if (bodyPath && artifact.mime?.startsWith("text/")) {
    try {
      content = await readFile(bodyPath, "utf8");
    } catch {
      content = null;
    }
  }
  return {
    ...artifact,
    body_path: bodyPath,
    size: artifact.size === null ? null : Number(artifact.size),
    archived: Boolean(artifact.archived),
    created_at: createdAt.toISOString(),
    downloadHref: `/artifacts/${artifact.id}/download`,
    retentionDaysRemaining: Math.max(0, 90 - Math.floor((Date.now() - createdAt.getTime()) / 86_400_000)),
    content,
  };
}

export function serializeArtifact(artifact: Artifact): ArtifactDto {
  return {
    id: artifact.id,
    orgId: artifact.org.id,
    filename: artifact.filename,
    path: artifact.path,
    mime: artifact.mime ?? null,
    metadataJson: artifact.metadataJson ?? {},
    createdAt: artifact.createdAt,
  };
}

function safeArtifactPath(value: string): string {
  const root = resolveArtifactStoreRoot();
  const candidate = value.startsWith("/") ? value : `${root}/${value}`;
  return assertArtifactPathInRoot(root, candidate);
}

async function artifactColumns(em: EntityManager): Promise<Set<string>> {
  const rows = await ormSqlConnection(em).execute<Array<{ column_name: string }>>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'artifacts'`,
  );
  return new Set(rows.map((row) => row.column_name));
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
