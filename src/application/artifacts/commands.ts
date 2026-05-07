import type { EntityManager } from "@mikro-orm/postgresql";

import { deleteArtifact } from "../../artifacts/storage.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { AgentRun } from "../../db/entities/orchestration/AgentRun.ts";
import { Artifact } from "../../db/entities/sandbox/Artifact.ts";
import { deleteArtifactAction } from "../../services/artifacts.ts";
import { AppValidationError } from "../errors.ts";
import { getArtifactDetail, serializeArtifact } from "./queries.ts";
import type { AppContext, ArtifactDto, CreateArtifactInput } from "./types.ts";

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
    });
    txEm.persist(artifact);
    await txEm.flush();
    return serializeArtifact(artifact);
  });
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
  }
}
