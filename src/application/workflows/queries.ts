import type { EntityManager } from "@mikro-orm/postgresql";

import {
  WorkflowService,
  type Methodology,
  type TransitionGraph,
  type TransitionValidationResult,
} from "../../services/WorkflowService.ts";

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
  return new WorkflowService(em).getTransitionGraph(ctx.orgId, input.projectId);
}

export function validateTransition(
  em: EntityManager,
  ctx: WorkflowAppContext,
  input: { projectId: string; fromStatus: string; toStatus: string },
): Promise<TransitionValidationResult> {
  return new WorkflowService(em).validateTransition(ctx.orgId, input.projectId, input.fromStatus, input.toStatus);
}

export function getDefaultWorkflow(methodology: Methodology): TransitionGraph {
  return new WorkflowService(null as never).getDefaultWorkflow(methodology);
}

export function getMethodology(
  em: EntityManager,
  ctx: WorkflowAppContext,
  input: { projectId: string },
): Promise<Methodology> {
  return new WorkflowService(em).getMethodology(ctx.orgId, input.projectId);
}

export function getEnabledTaskTypes(
  em: EntityManager,
  ctx: WorkflowAppContext,
  input: { projectId: string },
): Promise<string[]> {
  return new WorkflowService(em).getEnabledTaskTypes(ctx.orgId, input.projectId);
}
