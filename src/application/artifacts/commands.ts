import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "../../db/entities/auth/Org.ts";
import { AgentRun } from "../../db/entities/orchestration/AgentRun.ts";
import { Artifact } from "../../db/entities/sandbox/Artifact.ts";
import { AppValidationError } from "../errors.ts";
import { serializeArtifact } from "./queries.ts";
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
