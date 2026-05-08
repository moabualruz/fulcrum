import type { EntityManager } from "@mikro-orm/postgresql";

import { deleteArtifact } from "../../artifacts/storage.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { AgentRun } from "../../db/entities/orchestration/AgentRun.ts";
import { Artifact } from "../../db/entities/sandbox/Artifact.ts";
import { deleteArtifactAction } from "../../services/artifacts.ts";
import { AppValidationError } from "../errors.ts";
import { getArtifactDetail, serializeArtifact } from "./queries.ts";
import type { AppContext, ArtifactDto, CreateArtifactInput } from "./types.ts";

export type ArtifactLifecycleState = "created" | "pending_review" | "accepted" | "rejected" | "linked" | "promoted" | "archived" | "expired";

export async function createArtifact(em: EntityManager, ctx: AppContext, input: CreateArtifactInput): Promise<ArtifactDto> {
  if (!input.filename?.trim()) throw new AppValidationError("Artifact filename is required.");
  if (!input.path?.trim()) throw new AppValidationError("Artifact path is required.");
  return await em.transactional(async (txEm) => {
    const run = txEm.create(AgentRun, {
      org: txEm.getReference(Org, ctx.orgId),
      agentName: "artifact-system",
      status: "succeeded",
    });
    txEm.persist(run);
    const artifact = txEm.create(Artifact, {
      org: txEm.getReference(Org, ctx.orgId),
      run,
      filename: input.filename,
      path: input.path,
      mime: input.mime ?? null,
      metadataJson: {
        ...(input.metadataJson ?? {}),
        lifecycleState: String(input.metadataJson?.["lifecycleState"] ?? "created"),
      },
    });
    txEm.persist(artifact);
    await txEm.flush();
    return serializeArtifact(artifact);
  });
}

export async function transitionArtifactLifecycle(
  em: EntityManager,
  ctx: AppContext,
  input: { id: string; state: ArtifactLifecycleState },
): Promise<ArtifactDto> {
  const artifact = await em.findOne(Artifact, { id: input.id } as never);
  if (!artifact) throw new AppValidationError(`Artifact not found: ${input.id}`);
  if (artifact.org.id !== ctx.orgId) throw new AppValidationError(`Artifact not found: ${input.id}`);
  artifact.metadataJson = {
    ...(artifact.metadataJson ?? {}),
    lifecycleState: input.state,
    lifecycleChangedAt: new Date().toISOString(),
  };
  em.persist(artifact);
  await em.flush();
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
  await em.getConnection().execute(
    `UPDATE artifacts SET archived = true WHERE id = ? AND org_id = ?`,
    [input.id, ctx.orgId],
  );
}
