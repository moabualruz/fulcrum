/**
 * WorkflowDefinitionRepository — orchestration domain (Pillar 3, P3#02).
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WorkflowDefinition } from "@execution-orchestration/infrastructure/database/entities/orchestration/WorkflowDefinition.ts";

@Injectable()
export class WorkflowDefinitionRepository {
  constructor(
    @InjectRepository(WorkflowDefinition)
    private readonly workflowDefinitions: Repository<WorkflowDefinition>,
  ) {}
}
