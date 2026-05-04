/**
 * FeatureFlagRolloutRepository — platform domain (Pillar 17 cross-cutting).
 *
 * C6/C7: No raw SQL; queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<FeatureFlagRollout>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { FeatureFlagRollout } from "../../entities/platform/FeatureFlagRollout.ts";

@injectable()
export class FeatureFlagRolloutRepository extends EntityRepository<FeatureFlagRollout> {}
