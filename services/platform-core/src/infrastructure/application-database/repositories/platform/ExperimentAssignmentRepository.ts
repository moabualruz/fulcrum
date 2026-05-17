/**
 * ExperimentAssignmentRepository — platform domain (Pillar 17 cross-cutting).
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ExperimentAssignment } from "../../entities/platform/ExperimentAssignment.ts";

@Injectable()
export class ExperimentAssignmentRepository {
  constructor(
    @InjectRepository(ExperimentAssignment)
    private readonly experimentAssignments: Repository<ExperimentAssignment>,
  ) {}
}
