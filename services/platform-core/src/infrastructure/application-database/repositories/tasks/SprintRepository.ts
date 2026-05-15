/**
 * SprintRepository — tasks domain.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Sprint } from "../../entities/tasks/Sprint.ts";

@Injectable()
export class SprintRepository {
  constructor(
    @InjectRepository(Sprint)
    private readonly sprints: Repository<Sprint>,
  ) {}
}
