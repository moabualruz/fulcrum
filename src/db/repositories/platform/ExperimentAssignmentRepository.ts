/**
 * ExperimentAssignmentRepository — platform domain (Pillar 17 cross-cutting).
 *
 * C6/C7: No raw SQL; queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<ExperimentAssignment>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { ExperimentAssignment } from "../../entities/platform/ExperimentAssignment.ts";

@injectable()
export class ExperimentAssignmentRepository extends EntityRepository<ExperimentAssignment> {}
