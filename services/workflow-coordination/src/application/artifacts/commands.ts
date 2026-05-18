import type { EntityManager } from "typeorm";

import { deleteArtifact } from "@workflow-coordination/infrastructure/artifacts/storage.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { AgentRun } from "@execution-orchestration/infrastructure/database/entities/orchestration/AgentRun.ts";
import { Artifact } from "@execution-orchestration/infrastructure/database/entities/sandbox/Artifact.ts";
import { deleteArtifactAction } from "@workflow-coordination/application/artifact-service-actions.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { getArtifactDetail, serializeArtifact } from "@workflow-coordination/application/artifacts/queries.ts";
import type { AppContext, ArtifactDto, CreateArtifactInput } from "@workflow-coordination/domain/artifact.ts";

export type ArtifactLifecycleState = "created" | "pending_review" | "accepted" | "rejected" | "linked" | "promoted" | "archived" | "expired";

export async function createArtifact(em: EntityManager, ctx: AppContext, input: CreateArtifactInput): Promise<ArtifactDto> {
  if (!input.filename?.trim()) throw new AppValidationError("Artifact filename is required.");
  if (!input.path?.trim()) throw new AppValidationError("Artifact path is required.");
  return await em.transaction(async (txEm: EntityManager) => {
    const run = await txEm.save(AgentRun, {
      org: { id: ctx.orgId } as Org,
      agentName: "artifact-system",
      status: "succeeded",
    });
    const artifactEntity = txEm.create(Artifact, {
      org: { id: ctx.orgId } as Org,
      run,
      filename: input.filename,
      path: input.path,
      mime: input.mime ?? null,
      metadataJson: {
        ...(input.metadataJson ?? {}),
        lifecycleState: String(input.metadataJson?.["lifecycleState"] ?? "created"),
      },
    } as never);
    const artifact = await txEm.save(artifactEntity);
    return serializeArtifact(artifact as Artifact);
  });
}

export async function transitionArtifactLifecycle(
  em: EntityManager,
  ctx: AppContext,
  input: { id: string; state: ArtifactLifecycleState },
): Promise<ArtifactDto> {
  const artifact = await em.findOne(Artifact, { where: { id: input.id } as never });
  if (!artifact) throw new AppValidationError(`Artifact not found: ${input.id}`);
  if (artifact.org.id !== ctx.orgId) throw new AppValidationError(`Artifact not found: ${input.id}`);
  artifact.metadataJson = {
    ...(artifact.metadataJson ?? {}),
    lifecycleState: input.state,
    lifecycleChangedAt: new Date().toISOString(),
  };
  await em.save(artifact);
  return serializeArtifact(artifact);
}

export async function deleteArtifactForWeb(
  em: EntityManager,
  ctx: AppContext,
  input: { id: string; hard: boolean; confirm?: boolean },
): Promise<void> {
  const artifact = await getArtifactDetail(em, ctx, input.id);
  const guard = await deleteArtifact({
    artifact: {
      id: artifact.id,
      orgId: artifact.org_id,
      archived: artifact.archived,
      bodyPath: artifact.body_path,
    },
    callerOrgId: ctx.orgId,
    hard: input.hard,
    confirm: input.confirm,
  });
  if (!guard.ok && guard.reason === "confirmation_required") {
    throw new AppValidationError("Hard delete requires confirmation");
  }
  if (!guard.ok) return;
  if (input.hard) {
    await deleteArtifactAction(em, input.id, ctx.orgId);
    return;
  }
  await em.query(
    `UPDATE artifacts SET archived = true WHERE id = $1 AND org_id = $2`,
    [input.id, ctx.orgId],
  );
}

export async function archiveRunArtifactForWeb(
  em: EntityManager,
  ctx: AppContext,
  input: { runId: string; artifactId: string },
): Promise<void> {
  await updateRunArtifactMetadata(em, ctx, input, {
    archived: true,
    lifecycleState: "archived",
  });
}

export async function linkRunArtifactToDocForWeb(
  em: EntityManager,
  ctx: AppContext,
  input: { runId: string; artifactId: string; docId: string },
): Promise<void> {
  if (!input.docId.trim()) throw new AppValidationError("Document id is required.");
  await updateRunArtifactMetadata(em, ctx, input, {
    linkedDocId: input.docId.trim(),
    lifecycleState: "linked",
  });
}

export async function promoteRunArtifactToMemoryForWeb(
  em: EntityManager,
  ctx: AppContext,
  input: { runId: string; artifactId: string },
): Promise<void> {
  await updateRunArtifactMetadata(em, ctx, input, {
    promotedToMemory: true,
    lifecycleState: "promoted",
  });
}

async function updateRunArtifactMetadata(
  em: EntityManager,
  ctx: AppContext,
  input: { runId: string; artifactId: string },
  patch: Record<string, unknown>,
): Promise<void> {
  if (!input.artifactId.trim()) throw new AppValidationError("Artifact id is required.");
  const rows = await em.query(
    `SELECT metadata_json
       FROM artifacts
      WHERE id = $1 AND run_id = $2 AND org_id = $3
      LIMIT 1`,
    [input.artifactId, input.runId, ctx.orgId],
  ) as Array<{ metadata_json: Record<string, unknown> | null }>;
  const current = rows[0];
  if (!current) throw new AppValidationError(`Artifact not found: ${input.artifactId}`);
  const metadata = {
    ...(current.metadata_json ?? {}),
    ...patch,
    lifecycleChangedAt: new Date().toISOString(),
  };
  await em.query(
    `UPDATE artifacts
        SET archived = CASE WHEN $4::boolean THEN true ELSE archived END,
            metadata_json = $5::jsonb
      WHERE id = $1 AND run_id = $2 AND org_id = $3`,
    [input.artifactId, input.runId, ctx.orgId, patch["archived"] === true, JSON.stringify(metadata)],
  );
}
