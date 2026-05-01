/**
 * FeatureFlagRepository — auth domain.
 *
 * C6/C7: No raw SQL.
 * C8: needle-di @injectable().
 */

import { injectable } from "@needle-di/core";
import { EntityRepository, type InferEntity } from "@mikro-orm/postgresql";
import { FeatureFlagSchema } from "../../entities/auth/FeatureFlag.ts";

@injectable()
export class FeatureFlagRepository extends EntityRepository<
  InferEntity<typeof FeatureFlagSchema>
> {}
