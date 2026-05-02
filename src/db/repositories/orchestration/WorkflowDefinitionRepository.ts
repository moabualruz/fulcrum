/**
 * WorkflowDefinitionRepository — orchestration domain (Pillar 3, P3#02).
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<WorkflowDefinition>.
 * C9: src/db/repositories/orchestration/WorkflowDefinitionRepository.ts.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { WorkflowDefinition } from "../../entities/orchestration/WorkflowDefinition.ts";

@injectable()
export class WorkflowDefinitionRepository extends EntityRepository<WorkflowDefinition> {}
