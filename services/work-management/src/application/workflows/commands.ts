import type { EntityManager } from "@mikro-orm/postgresql";

import type { Methodology, TransitionGraph } from "@work-management/application/workflow-rules-service.ts";
import { WorkflowRulesService } from "@work-management/application/workflow-rules-service.ts";
import type { WorkflowAppContext } from "@work-management/application/workflows/queries.ts";

export function updateTransitions(
  em: EntityManager,
  ctx: WorkflowAppContext,
  input: { projectId: string; transitions: TransitionGraph },
): Promise<void> {
  return new WorkflowRulesService(em).updateTransitions(ctx.orgId, input.projectId, input.transitions);
}

export function updateMethodology(
  em: EntityManager,
  ctx: WorkflowAppContext,
  input: { projectId: string; methodology: Methodology; resetWorkflow: boolean },
): Promise<void> {
  return new WorkflowRulesService(em).updateMethodology(ctx.orgId, input.projectId, input.methodology, input.resetWorkflow);
}

export function updateEnabledTaskTypes(
  em: EntityManager,
  ctx: WorkflowAppContext,
  input: { projectId: string; types: string[] },
): Promise<void> {
  return new WorkflowRulesService(em).updateEnabledTaskTypes(ctx.orgId, input.projectId, input.types);
}
