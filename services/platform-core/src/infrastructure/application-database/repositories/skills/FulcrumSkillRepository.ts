/**
 * FulcrumSkillRepository — skills registry domain.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FulcrumSkill } from "../../entities/skills/FulcrumSkill.ts";

@Injectable()
export class FulcrumSkillRepository {
  constructor(
    @InjectRepository(FulcrumSkill)
    private readonly fulcrumSkills: Repository<FulcrumSkill>,
  ) {}
}
