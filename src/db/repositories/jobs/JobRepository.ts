/**
 * JobRepository — jobs domain (Pillar 12).
 *
 * Stub repository — Pillar 12 fills in domain methods (queue dispatch, etc.).
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Job>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Job } from "../../entities/jobs/Job.ts";

@injectable()
export class JobRepository extends EntityRepository<Job> {}
