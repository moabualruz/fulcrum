import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ModelCache, type ModelCacheKind, type ModelCacheSource } from "../../entities/inference/ModelCache.ts";
import type { Org } from "../../entities/auth/Org.ts";

@Injectable()
export class ModelCacheRepository {
  constructor(
    @InjectRepository(ModelCache)
    private readonly modelCaches: Repository<ModelCache>,
  ) {}

  async markDownloaded(input: {
    org: Org;
    modelId: string;
    kind: ModelCacheKind;
    source?: ModelCacheSource;
    sizeBytes?: number;
    localPath?: string;
    sha256?: string;
  }): Promise<ModelCache> {
    let row = await this.modelCaches.findOne({
      where: { org: { id: input.org.id }, modelId: input.modelId },
    });
    if (!row) {
      row = this.modelCaches.create({
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
    return this.modelCaches.save(row);
  }

  async markMissing(input: { org: Org; modelId: string }): Promise<void> {
    const row = await this.modelCaches.findOne({
      where: { org: { id: input.org.id }, modelId: input.modelId },
    });
    if (!row) return;
    row.downloaded = false;
    row.active = false;
    await this.modelCaches.save(row);
  }
}
