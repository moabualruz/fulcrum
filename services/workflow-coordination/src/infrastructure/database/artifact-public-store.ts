import { randomUUID } from "node:crypto";

import { DataSource, type FindOptionsWhere } from "typeorm";

import {
  FulcrumArtifactEntity,
  type FulcrumArtifact,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";

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

    return toPublicRow(await this.dataSource.getRepository(FulcrumArtifactEntity).save(artifact));
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
    return toPublicRow(await this.dataSource.getRepository(FulcrumArtifactEntity).save(artifact));
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
    return toPublicRow(await this.dataSource.getRepository(FulcrumArtifactEntity).save(artifact));
  }

  async downloadArtifact(id: string): Promise<ArtifactPublicDownload | null> {
    const artifact = await this.getArtifact(id);
    if (!artifact) return null;
    return {
      artifact,
      bodyPath: artifact.bodyPath,
      checksumSha256: artifact.checksumSha256,
    };
  }

  async deleteArtifact(id: string, input: { hard?: boolean | string }): Promise<ArtifactPublicDeleteResult | null> {
    const artifact = await this.findArtifact(id);
    if (!artifact) return null;
    const hard = parseBoolean(input.hard) === true;
    if (hard) {
      await this.dataSource.getRepository(FulcrumArtifactEntity).delete({ id });
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
    await this.dataSource.getRepository(FulcrumArtifactEntity).save(artifact);
    return { ok: true, id, hard: false };
  }

  private async findArtifact(id: string): Promise<FulcrumArtifact | null> {
    return await this.dataSource.getRepository(FulcrumArtifactEntity).findOne({
      where: { id },
    });
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
