import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Org } from "../../entities/auth/Org.ts";
import type { ModelCache, ModelCacheKind, ModelCacheSource } from "../../entities/inference/ModelCache.ts";

@injectable()
export class ModelCacheRepository extends EntityRepository<ModelCache> {
  async markDownloaded(input: {
    org: Org;
    modelId: string;
    kind: ModelCacheKind;
    source?: ModelCacheSource;
    sizeBytes?: number;
    localPath?: string;
    sha256?: string;
  }): Promise<ModelCache> {
    let row = await this.findOne({ org: input.org, modelId: input.modelId } as never);
    if (!row) {
      row = this.create({
        org: input.org,
        modelId: input.modelId,
        kind: input.kind,
        source: input.source ?? "huggingface",
      });
    }

    row.downloaded = true;
    row.active ||= input.kind === "embed";
    row.kind = input.kind;
    row.source = input.source ?? row.source ?? "huggingface";
    if (input.sizeBytes !== undefined) row.sizeBytes = BigInt(input.sizeBytes);
    if (input.localPath !== undefined) row.localPath = input.localPath;
    if (input.sha256 !== undefined) row.sha256 = input.sha256;
    this.getEntityManager().persist(row);
    await this.getEntityManager().flush();
    return row;
  }

  async markMissing(input: { org: Org; modelId: string }): Promise<void> {
    const row = await this.findOne({ org: input.org, modelId: input.modelId } as never);
    if (!row) return;
    row.downloaded = false;
    row.active = false;
    this.getEntityManager().persist(row);
    await this.getEntityManager().flush();
  }
}
