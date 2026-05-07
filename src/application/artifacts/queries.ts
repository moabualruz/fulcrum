import type { EntityManager } from "@mikro-orm/postgresql";
import { readFile } from "node:fs/promises";

import { assertArtifactPathInRoot, resolveArtifactStoreRoot } from "../../artifacts/storage.ts";
import { Artifact } from "../../db/entities/sandbox/Artifact.ts";
import type { ArtifactDetail } from "../../services/artifacts.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import { ormSqlConnection } from "../orm-helpers.ts";
import type { AppContext, ArtifactDto } from "./types.ts";

export async function listArtifacts(em: EntityManager, ctx: AppContext): Promise<ArtifactDto[]> {
  const artifacts = await em.find(Artifact, { org: ctx.orgId } as never, { orderBy: { createdAt: "DESC", id: "ASC" } });
  return artifacts.map(serializeArtifact);
}

export async function getArtifact(em: EntityManager, ctx: AppContext, id: string): Promise<ArtifactDto> {
  const artifact = await em.findOne(Artifact, { id } as never);
  if (!artifact) throw new AppNotFoundError(`Artifact not found: ${id}`);
  if (artifact.org.id !== ctx.orgId) throw new AppForbiddenError(`Artifact does not belong to org: ${ctx.orgId}`);
  return serializeArtifact(artifact);
}

export async function getArtifactDetail(em: EntityManager, ctx: AppContext, id: string): Promise<ArtifactDetail> {
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
            t.project_id,
            a.run_id,
            a.task_id,
            'artifact'::text AS kind,
            a.filename AS title,
            a.path AS body_path,
            a.checksum_sha256 AS sha256,
            a.size_bytes AS size,
            a.mime,
            false AS archived,
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
    createdAt: artifact.createdAt,
  };
}

function safeArtifactPath(value: string): string {
  const root = resolveArtifactStoreRoot();
  const candidate = value.startsWith("/") ? value : `${root}/${value}`;
  return assertArtifactPathInRoot(root, candidate);
}
