/**
 * SprintRepository — tasks domain.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Sprint>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Sprint } from "../../entities/tasks/Sprint.ts";

@injectable()
export class SprintRepository extends EntityRepository<Sprint> {}
