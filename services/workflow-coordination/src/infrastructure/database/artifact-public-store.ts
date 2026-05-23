import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { DataSource, type FindOptionsWhere } from "typeorm";

import {
  FulcrumArtifactEntity,
  type FulcrumArtifact,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import { WorkflowAuditEventEntity } from "@workflow-coordination/infrastructure/database/audit-log.entities.ts";
import {
  assertArtifactPathInRoot,
  resolveArtifactStoreRoot,
} from "@workflow-coordination/infrastructure/artifacts/storage.ts";

export interface ArtifactPublicListInput {
  projectId?: string;
  traceId?: string;
  kind?: string;
  runId?: string;
  taskId?: string;
  docId?: string;
  mime?: string;
  lifecycleState?: string;
  archived?: boolean | string;
  limit?: number | string;
}

export interface ArtifactPublicCreateInput {
  id?: string;
  projectId?: string;
  traceId?: string;
  runId?: string | null;
  taskId?: string | null;
  docId?: string | null;
  kind?: string;
  title?: string;
  filename?: string | null;
  bodyPath?: string | null;
  checksumSha256?: string | null;
  mime?: string | null;
  sizeBytes?: string | number | bigint | null;
  lifecycleState?: string;
  metadataJson?: Record<string, unknown> | null;
}

export interface ArtifactPublicRow {
  id: string;
  projectId: string;
  traceId: string;
  runId: string | null;
  taskId: string | null;
  docId: string | null;
  kind: string;
  title: string;
  filename: string | null;
  bodyPath: string | null;
  checksumSha256: string | null;
  mime: string | null;
  sizeBytes: string;
  lifecycleState: string;
  metadataJson: Record<string, unknown>;
  archived: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactPublicDownload {
  artifact: ArtifactPublicRow;
  bodyPath: string | null;
  checksumSha256: string | null;
  contentBase64: string | null;
  filename: string;
  mime: string;
  sizeBytes: string;
}

export interface ArtifactPublicDeleteResult {
  ok: true;
  id: string;
  hard: boolean;
}

export class ArtifactPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async listArtifacts(input: ArtifactPublicListInput): Promise<ArtifactPublicRow[]> {
    const where: FindOptionsWhere<FulcrumArtifact> = {};

    if (input.projectId) where.projectId = input.projectId;
    if (input.traceId) where.traceId = input.traceId;
    if (input.kind) where.kind = input.kind;
    if (input.runId) where.runId = input.runId;
    if (input.taskId) where.taskId = input.taskId;
    if (input.docId) where.docId = input.docId;
    if (input.mime) where.mime = input.mime;
    if (input.lifecycleState) where.lifecycleState = input.lifecycleState;
    const archived = parseBoolean(input.archived);
    if (archived !== undefined) where.archived = archived;

    const artifacts = await this.dataSource.getRepository(FulcrumArtifactEntity).find({
      where,
      order: { createdAt: "ASC", id: "ASC" },
      take: parseLimit(input.limit),
    });

    return artifacts.map(toPublicRow);
  }

  async getArtifact(id: string): Promise<ArtifactPublicRow | null> {
    const artifact = await this.dataSource.getRepository(FulcrumArtifactEntity).findOne({
      where: { id },
    });

    return artifact ? toPublicRow(artifact) : null;
  }

  async createArtifact(input: ArtifactPublicCreateInput): Promise<ArtifactPublicRow> {
    const filename = cleanOptionalString(input.filename);
    const title = cleanOptionalString(input.title) ?? filename;
    const lifecycleState = cleanOptionalString(input.lifecycleState) ?? "created";
    const metadataJson = {
      ...(input.metadataJson ?? {}),
      lifecycleState,
    };
    const artifact = this.dataSource.getRepository(FulcrumArtifactEntity).create({
      id: cleanOptionalString(input.id) ?? `artifact-${randomUUID()}`,
      projectId: requiredString(input.projectId, "projectId"),
      traceId: requiredString(input.traceId, "traceId"),
      runId: cleanOptionalString(input.runId),
      taskId: cleanOptionalString(input.taskId),
      docId: cleanOptionalString(input.docId),
      kind: cleanOptionalString(input.kind) ?? "file",
      title: title ?? requiredString(input.filename, "filename"),
      filename,
      bodyPath: cleanOptionalString(input.bodyPath),
      checksumSha256: cleanOptionalString(input.checksumSha256),
      mime: cleanOptionalString(input.mime),
      sizeBytes: stringifySize(input.sizeBytes),
      lifecycleState,
      metadataJson,
      archived: false,
      archivedAt: null,
      deletedAt: null,
    });

    const saved = await this.dataSource.getRepository(FulcrumArtifactEntity).save(artifact);
    await this.recordArtifactAudit(saved, "created", { lifecycleState });
    return toPublicRow(saved);
  }

  async setArtifactLifecycle(id: string, lifecycleState: string): Promise<ArtifactPublicRow | null> {
    const artifact = await this.findArtifact(id);
    if (!artifact) return null;
    artifact.lifecycleState = lifecycleState;
    artifact.metadataJson = {
      ...(artifact.metadataJson ?? {}),
      lifecycleState,
      lifecycleChangedAt: new Date().toISOString(),
    };
    const saved = await this.dataSource.getRepository(FulcrumArtifactEntity).save(artifact);
    await this.recordArtifactAudit(saved, lifecycleState, { lifecycleState });
    return toPublicRow(saved);
  }

  async setArtifactArchived(id: string, archived: boolean): Promise<ArtifactPublicRow | null> {
    const artifact = await this.findArtifact(id);
    if (!artifact) return null;
    const lifecycleState = archived ? "archived" : "created";
    artifact.archived = archived;
    artifact.archivedAt = archived ? new Date() : null;
    artifact.lifecycleState = lifecycleState;
    artifact.metadataJson = {
      ...(artifact.metadataJson ?? {}),
      lifecycleState,
      lifecycleChangedAt: new Date().toISOString(),
    };
    const saved = await this.dataSource.getRepository(FulcrumArtifactEntity).save(artifact);
    await this.recordArtifactAudit(saved, archived ? "archived" : "unarchived", {
      lifecycleState,
      archived,
    });
    return toPublicRow(saved);
  }

  async downloadArtifact(id: string): Promise<ArtifactPublicDownload | null> {
    const artifact = await this.getArtifact(id);
    if (!artifact) return null;
    const bodyPath = safeArtifactBodyPath(artifact.bodyPath);
    const contentBase64 = bodyPath ? await readArtifactContentBase64(bodyPath) : null;
    return {
      artifact,
      bodyPath,
      checksumSha256: artifact.checksumSha256,
      contentBase64,
      filename: artifact.filename ?? artifact.title ?? artifact.id,
      mime: artifact.mime ?? "application/octet-stream",
      sizeBytes: artifact.sizeBytes,
    };
  }

  async deleteArtifact(id: string, input: { hard?: boolean | string }): Promise<ArtifactPublicDeleteResult | null> {
    const artifact = await this.findArtifact(id);
    if (!artifact) return null;
    const hard = parseBoolean(input.hard) === true;
    if (hard) {
      await this.dataSource.getRepository(FulcrumArtifactEntity).delete({ id });
      await this.recordArtifactAudit(artifact, "deleted", { hard: true });
      return { ok: true, id, hard: true };
    }

    artifact.archived = true;
    artifact.archivedAt = new Date();
    artifact.lifecycleState = "archived";
    artifact.metadataJson = {
      ...(artifact.metadataJson ?? {}),
      lifecycleState: "archived",
      lifecycleChangedAt: new Date().toISOString(),
    };
    const saved = await this.dataSource.getRepository(FulcrumArtifactEntity).save(artifact);
    await this.recordArtifactAudit(saved, "archived", { lifecycleState: "archived", hard: false });
    return { ok: true, id, hard: false };
  }

  private async findArtifact(id: string): Promise<FulcrumArtifact | null> {
    return await this.dataSource.getRepository(FulcrumArtifactEntity).findOne({
      where: { id },
    });
  }

  private async recordArtifactAudit(
    artifact: FulcrumArtifact,
    verb: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const orgId = await this.resolveAuditOrgId(artifact.projectId);
    await this.dataSource.getRepository(WorkflowAuditEventEntity).save({
      id: randomUUID(),
      orgId,
      projectId: artifact.projectId,
      userId: null,
      verb,
      subjectKind: "artifact",
      subjectId: artifact.id,
      traceId: artifact.traceId,
      payload: {
        artifactId: artifact.id,
        projectId: artifact.projectId,
        traceId: artifact.traceId,
        kind: artifact.kind,
        ...payload,
      },
    });
  }

  private async resolveAuditOrgId(projectId: string): Promise<string> {
    const rows = await this.dataSource.query(
      "SELECT workspace_id FROM fulcrum_projects WHERE id = $1 LIMIT 1",
      [projectId],
    ) as Array<{ workspace_id?: string }>;
    return rows[0]?.workspace_id ?? "local";
  }
}

function parseLimit(limit: number | string | undefined): number | undefined {
  if (limit === undefined) return 100;
  const parsed = typeof limit === "number" ? limit : Number.parseInt(limit, 10);
  if (!Number.isInteger(parsed)) return 100;
  return Math.min(Math.max(parsed, 1), 1000);
}

function toPublicRow(artifact: FulcrumArtifact): ArtifactPublicRow {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    traceId: artifact.traceId,
    runId: artifact.runId ?? null,
    taskId: artifact.taskId ?? null,
    docId: artifact.docId ?? null,
    kind: artifact.kind,
    title: artifact.title,
    filename: artifact.filename ?? null,
    bodyPath: artifact.bodyPath,
    checksumSha256: artifact.checksumSha256,
    mime: artifact.mime ?? null,
    sizeBytes: String(artifact.sizeBytes ?? "0"),
    lifecycleState: artifact.lifecycleState ?? "created",
    metadataJson: artifact.metadataJson ?? {},
    archived: Boolean(artifact.archived),
    archivedAt: artifact.archivedAt ? artifact.archivedAt.toISOString() : null,
    deletedAt: artifact.deletedAt ? artifact.deletedAt.toISOString() : null,
    createdAt: (artifact.createdAt ?? new Date(0)).toISOString(),
    updatedAt: (artifact.updatedAt ?? new Date(0)).toISOString(),
  };
}

function requiredString(value: unknown, name: string): string {
  const cleaned = cleanOptionalString(value);
  if (cleaned) return cleaned;
  throw new Error(`${name} is required.`);
}

function cleanOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringifySize(value: string | number | bigint | null | undefined): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "string" && value.trim()) return value.trim();
  return "0";
}

function parseBoolean(value: boolean | string | undefined): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return undefined;
}

function safeArtifactBodyPath(bodyPath: string | null): string | null {
  if (!bodyPath) return null;
  const normalized = bodyPath.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("\0")) return null;
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return normalized;
}

async function readArtifactContentBase64(bodyPath: string): Promise<string | null> {
  try {
    const safePath = assertArtifactPathInRoot(resolveArtifactStoreRoot(), bodyPath);
    return (await readFile(safePath)).toString("base64");
  } catch {
    return null;
  }
}
