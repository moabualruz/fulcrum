import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { ModelCache } from "../../entities/inference/ModelCache.ts";

@injectable()
export class ModelCacheRepository extends EntityRepository<ModelCache> {}
