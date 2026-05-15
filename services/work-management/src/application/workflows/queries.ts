import type { EntityManager } from "typeorm";

import {
  WorkflowRulesService,
  type Methodology,
  type TransitionGraph,
  type TransitionValidationResult,
} from "@work-management/application/workflow-rules-service.ts";

export type { Methodology, TransitionGraph, TransitionValidationResult };

export interface WorkflowAppContext {
  orgId: string;
  userId: string;
}

export function getTransitions(
  em: EntityManager,
  ctx: WorkflowAppContext,
  input: { projectId: string },
): Promise<TransitionGraph> {
  return new WorkflowRulesService(em).getTransitionGraph(ctx.orgId, input.projectId);
}

export function validateTransition(
  em: EntityManager,
  ctx: WorkflowAppContext,
  input: { projectId: string; fromStatus: string; toStatus: string },
): Promise<TransitionValidationResult> {
  return new WorkflowRulesService(em).validateTransition(ctx.orgId, input.projectId, input.fromStatus, input.toStatus);
}

export function getDefaultWorkflow(methodology: Methodology): TransitionGraph {
  return new WorkflowRulesService(null as never).getDefaultWorkflow(methodology);
}

export function getMethodology(
  em: EntityManager,
  ctx: WorkflowAppContext,
  input: { projectId: string },
): Promise<Methodology> {
  return new WorkflowRulesService(em).getMethodology(ctx.orgId, input.projectId);
}

export function getEnabledTaskTypes(
  em: EntityManager,
  ctx: WorkflowAppContext,
  input: { projectId: string },
): Promise<string[]> {
  return new WorkflowRulesService(em).getEnabledTaskTypes(ctx.orgId, input.projectId);
}
