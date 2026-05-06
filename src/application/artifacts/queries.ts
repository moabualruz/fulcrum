import type { EntityManager } from "@mikro-orm/postgresql";

import { Artifact } from "../../db/entities/sandbox/Artifact.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
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
