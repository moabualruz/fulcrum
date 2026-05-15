/**
 * WorkflowRulesService.
 *
 * Enforces hard transition rules (D-22..D-25) via project.workflow_config jsonb.
 * Manages methodology (scrum/kanban/none) and enabled_task_types per project.
 *
 * Security: orgId scope enforced on every query (T-05-08 mitigation).
 */

import type { EntityManager } from "typeorm";

import { Project, type WorkflowConfig } from "@work-management/infrastructure/database/entities/tasks/Project.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";

// ── Constants ──────────────────────────────────────────────────────────────────

const TASK_TYPES = ["epic", "task", "subtask", "bug"] as const;
type TaskType = typeof TASK_TYPES[number];

export type Methodology = "scrum" | "kanban" | "none";

export interface TransitionGraph {
  [fromStatus: string]: string[];
}

export interface TransitionValidationResult {
  allowed: boolean;
  reason?: string;
}

// ── Service ────────────────────────────────────────────────────────────────────

export class WorkflowRulesService {
  constructor(private readonly em: EntityManager) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async findProject(orgId: string, projectId: string): Promise<Project> {
    const project = await this.em.findOne(Project, {
      id: projectId,
      org: { id: orgId },
    } as never);

    if (!project) {
      throw new AppNotFoundError(`Project ${projectId} not found in org ${orgId}`);
    }

    return project;
  }

  // ── Transition graph ──────────────────────────────────────────────────────────

  async getTransitionGraph(orgId: string, projectId: string): Promise<TransitionGraph> {
    const project = await this.findProject(orgId, projectId);
    return project.workflowConfig?.transitions ?? {};
  }

  async updateTransitions(
    orgId: string,
    projectId: string,
    transitions: TransitionGraph,
  ): Promise<void> {
    const project = await this.findProject(orgId, projectId);
    project.workflowConfig = { ...(project.workflowConfig ?? {}), transitions };
  }

  async validateTransition(
    orgId: string,
    projectId: string,
    fromStatus: string,
    toStatus: string,
  ): Promise<TransitionValidationResult> {
    const project = await this.findProject(orgId, projectId);
    const transitions = project.workflowConfig?.transitions;

    // Permissive default — no config = all transitions allowed (D-23)
    if (!transitions || Object.keys(transitions).length === 0) {
      return { allowed: true };
    }

    const allowed = transitions[fromStatus]?.includes(toStatus) ?? false;
    if (!allowed) {
      return {
        allowed: false,
        reason: `Transition from '${fromStatus}' to '${toStatus}' is not configured in workflow`,
      };
    }

    return { allowed: true };
  }

  // ── Default workflows (D-23) ──────────────────────────────────────────────────

  getDefaultWorkflow(methodology: Methodology): TransitionGraph {
    switch (methodology) {
      case "scrum":
        return {
          Backlog: ["Todo", "Canceled"],
          Todo: ["InProgress", "Backlog", "Canceled"],
          InProgress: ["InReview", "Todo", "Canceled"],
          InReview: ["Done", "InProgress", "Canceled"],
          Done: ["Canceled"],
          Canceled: ["Backlog"],
        };
      case "kanban":
        return {
          Backlog: ["InProgress", "Canceled"],
          InProgress: ["InReview", "Backlog", "Canceled"],
          InReview: ["Done", "InProgress", "Canceled"],
          Done: ["Canceled"],
          Canceled: ["Backlog"],
        };
      case "none":
        return {};
    }
  }

  // ── Methodology ───────────────────────────────────────────────────────────────

  async getMethodology(orgId: string, projectId: string): Promise<Methodology> {
    const project = await this.findProject(orgId, projectId);
    return project.methodology as Methodology;
  }

  async updateMethodology(
    orgId: string,
    projectId: string,
    methodology: Methodology,
    resetWorkflow: boolean,
  ): Promise<void> {
    const project = await this.findProject(orgId, projectId);
    project.methodology = methodology;

    if (resetWorkflow) {
      project.workflowConfig = {
        transitions: this.getDefaultWorkflow(methodology),
      };
    }
  }

  // ── Enabled task types ────────────────────────────────────────────────────────

  async getEnabledTaskTypes(orgId: string, projectId: string): Promise<string[]> {
    const project = await this.findProject(orgId, projectId);
    return project.enabledTaskTypes ?? ["epic", "task", "subtask", "bug"];
  }

  async updateEnabledTaskTypes(
    orgId: string,
    projectId: string,
    types: string[],
  ): Promise<void> {
    const invalid = types.filter((t) => !(TASK_TYPES as readonly string[]).includes(t));
    if (invalid.length > 0) {
      throw new AppValidationError(`Invalid task types: ${invalid.join(", ")}. Valid types: ${TASK_TYPES.join(", ")}`);
    }

    const project = await this.findProject(orgId, projectId);
    project.enabledTaskTypes = types;
  }
}
