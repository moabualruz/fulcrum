/**
 * FulcrumSkillRepository — skills registry domain.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { FulcrumSkill } from "../../entities/skills/FulcrumSkill.ts";

@injectable()
export class FulcrumSkillRepository extends EntityRepository<FulcrumSkill> {}
