import type { DataSource } from "typeorm";

import {
  FulcrumProjectEntity,
  type FulcrumProject,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import type { WorkflowMethodology, WorkflowTransitionGraph } from "@work-management/domain/workflow-settings.ts";

export interface WorkflowProjectScope {
  orgId: string;
  projectId: string;
}

export interface WorkflowTransitionValidationResult {
  projectId: string;
  allowed: boolean;
  reason?: string;
}

const WORK_ITEM_TYPES = ["epic", "task", "subtask", "bug"] as const;
const DEFAULT_WORK_ITEM_TYPES = [...WORK_ITEM_TYPES];

export class WorkflowSettingsStore {
  constructor(private readonly dataSource: DataSource) {}

  getDefaultWorkflow(input: { methodology: WorkflowMethodology }): {
    methodology: WorkflowMethodology;
    transitions: WorkflowTransitionGraph;
  } {
    return {
      methodology: input.methodology,
      transitions: defaultTransitions(input.methodology),
    };
  }

  async getMethodology(input: WorkflowProjectScope): Promise<{ projectId: string; methodology: WorkflowMethodology } | null> {
    const project = await this.findScopedProject(input);
    if (!project) return null;
    return {
      projectId: project.id,
      methodology: normalizeMethodology(project.methodology),
    };
  }

  async updateMethodology(input: WorkflowProjectScope & {
    methodology: WorkflowMethodology;
    resetWorkflow?: boolean;
  }): Promise<{
    projectId: string;
    methodology: WorkflowMethodology;
    transitions: WorkflowTransitionGraph;
  } | null> {
    const project = await this.findScopedProject(input);
    if (!project) return null;
    const methodology = normalizeMethodology(input.methodology);
    project.methodology = methodology;
    if (input.resetWorkflow) {
      project.workflowConfig = {
        ...(project.workflowConfig ?? {}),
        transitions: defaultTransitions(methodology),
      };
    }
    const saved = await this.projectRepository().save(project);
    return {
      projectId: saved.id,
      methodology,
      transitions: transitionGraphOf(saved),
    };
  }

  async getEnabledTaskTypes(input: WorkflowProjectScope): Promise<{ projectId: string; enabledTaskTypes: string[] } | null> {
    const project = await this.findScopedProject(input);
    if (!project) return null;
    return {
      projectId: project.id,
      enabledTaskTypes: enabledTaskTypesOf(project),
    };
  }

  async updateEnabledTaskTypes(input: WorkflowProjectScope & {
    types: string[];
  }): Promise<{ projectId: string; enabledTaskTypes: string[] } | null> {
    const project = await this.findScopedProject(input);
    if (!project) return null;
    const invalid = input.types.filter((type) => !WORK_ITEM_TYPES.includes(type as typeof WORK_ITEM_TYPES[number]));
    if (invalid.length > 0) {
      throw new Error(`Invalid task types: ${invalid.join(", ")}. Valid types: ${WORK_ITEM_TYPES.join(", ")}`);
    }
    project.enabledTaskTypes = input.types;
    const saved = await this.projectRepository().save(project);
    return {
      projectId: saved.id,
      enabledTaskTypes: enabledTaskTypesOf(saved),
    };
  }

  async getTransitions(input: WorkflowProjectScope): Promise<{ projectId: string; transitions: WorkflowTransitionGraph } | null> {
    const project = await this.findScopedProject(input);
    if (!project) return null;
    return {
      projectId: project.id,
      transitions: transitionGraphOf(project),
    };
  }

  async updateTransitions(input: WorkflowProjectScope & {
    transitions: WorkflowTransitionGraph;
  }): Promise<{ projectId: string; transitions: WorkflowTransitionGraph } | null> {
    const project = await this.findScopedProject(input);
    if (!project) return null;
    project.workflowConfig = {
      ...(project.workflowConfig ?? {}),
      transitions: normalizeTransitions(input.transitions),
    };
    const saved = await this.projectRepository().save(project);
    return {
      projectId: saved.id,
      transitions: transitionGraphOf(saved),
    };
  }

  async validateTransition(input: WorkflowProjectScope & {
    fromStatus: string;
    toStatus: string;
  }): Promise<WorkflowTransitionValidationResult | null> {
    const project = await this.findScopedProject(input);
    if (!project) return null;
    const transitions = transitionGraphOf(project);
    if (Object.keys(transitions).length === 0) {
      return {
        projectId: project.id,
        allowed: true,
      };
    }
    const allowed = transitions[input.fromStatus]?.includes(input.toStatus) ?? false;
    return allowed
      ? { projectId: project.id, allowed: true }
      : {
        projectId: project.id,
        allowed: false,
        reason: `Transition from '${input.fromStatus}' to '${input.toStatus}' is not configured in workflow`,
      };
  }

  private async findScopedProject(input: WorkflowProjectScope): Promise<FulcrumProject | null> {
    return await this.projectRepository().findOneBy({
      id: input.projectId,
      workspaceId: input.orgId,
    });
  }

  private projectRepository() {
    return this.dataSource.getRepository(FulcrumProjectEntity);
  }
}

export function defaultTransitions(methodology: WorkflowMethodology): WorkflowTransitionGraph {
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

function normalizeMethodology(value: string): WorkflowMethodology {
  if (value === "scrum" || value === "kanban" || value === "none") return value;
  return "kanban";
}

function enabledTaskTypesOf(project: FulcrumProject): string[] {
  return Array.isArray(project.enabledTaskTypes) && project.enabledTaskTypes.length > 0
    ? project.enabledTaskTypes
    : DEFAULT_WORK_ITEM_TYPES;
}

function transitionGraphOf(project: FulcrumProject): WorkflowTransitionGraph {
  const transitions = project.workflowConfig?.["transitions"];
  if (!transitions || typeof transitions !== "object" || Array.isArray(transitions)) return {};
  return normalizeTransitions(transitions as WorkflowTransitionGraph);
}

function normalizeTransitions(transitions: WorkflowTransitionGraph): WorkflowTransitionGraph {
  return Object.fromEntries(
    Object.entries(transitions).filter(([from, to]) =>
      from.trim() && Array.isArray(to)
    ).map(([from, to]) => [
      from,
      to.filter((status): status is string => typeof status === "string" && status.trim().length > 0),
    ]),
  );
}
