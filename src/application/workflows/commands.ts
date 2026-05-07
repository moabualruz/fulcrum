import type { EntityManager } from "@mikro-orm/postgresql";

import type { Methodology, TransitionGraph } from "../../services/WorkflowService.ts";
import { WorkflowService } from "../../services/WorkflowService.ts";
import type { WorkflowAppContext } from "./queries.ts";

export function updateTransitions(
  em: EntityManager,
  ctx: WorkflowAppContext,
  input: { projectId: string; transitions: TransitionGraph },
): Promise<void> {
  return new WorkflowService(em).updateTransitions(ctx.orgId, input.projectId, input.transitions);
}

export function updateMethodology(
  em: EntityManager,
  ctx: WorkflowAppContext,
  input: { projectId: string; methodology: Methodology; resetWorkflow: boolean },
): Promise<void> {
  return new WorkflowService(em).updateMethodology(ctx.orgId, input.projectId, input.methodology, input.resetWorkflow);
}

export function updateEnabledTaskTypes(
  em: EntityManager,
  ctx: WorkflowAppContext,
  input: { projectId: string; types: string[] },
): Promise<void> {
  return new WorkflowService(em).updateEnabledTaskTypes(ctx.orgId, input.projectId, input.types);
}
