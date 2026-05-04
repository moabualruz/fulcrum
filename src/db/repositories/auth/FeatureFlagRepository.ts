/**
 * FeatureFlagRepository — auth domain.
 *
 * C6/C7: No raw SQL.
 * C8: needle-di @injectable(); extends EntityRepository<FeatureFlag>.
 *
 * Circular-import safety: FeatureFlag is imported as `type` only — generic type
 * parameter erased at runtime; no circular VALUE dependency.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { FeatureFlag } from "../../entities/auth/FeatureFlag.ts";

@injectable()
export class FeatureFlagRepository extends EntityRepository<FeatureFlag> {}
