/**
 * Symphony WORKFLOW.md prompt renderer.
 *
 * C6: app code uses MikroORM repositories only. Liquid strict mode is mandatory
 * so template mistakes fail before dispatch instead of silently rendering empty.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { Liquid, UndefinedVariableError } from "liquidjs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { WorkflowDefinition } from "@platform-core/infrastructure/application-database/entities/orchestration/WorkflowDefinition.ts";
import type { WorkflowDefinitionRepository } from "@platform-core/infrastructure/application-database/repositories/orchestration/WorkflowDefinitionRepository.ts";
import { WorkflowConfigSchema, type WorkflowConfig } from "./schemas.ts";

export { WorkflowConfigSchema } from "./schemas.ts";
export type { WorkflowConfig } from "./schemas.ts";

export class UnknownVariableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnknownVariableError";
  }
}

const WorkflowConfigYamlSchema = z.object({
  stall_timeout_ms: z.number().int().positive().optional(),
  max_retry_backoff_ms: z.number().int().positive().optional(),
  keepOnFailure: z.boolean().optional(),
  maxAttempts: z.number().int().positive().optional(),
}).strict();

export interface PromptWorkflowDef {
  id: string;
  promptMd: string;
  configYaml: string;
  projectId?: string | null;
  name?: string;
}

export interface RenderPromptContext {
  issue: Record<string, unknown>;
  attempt: number | null;
}

const liquid = new Liquid({
  strictVariables: true,
  strictFilters: true,
});

export function parseWorkflowConfig(configYaml: string): WorkflowConfig {
  const parsed = parseYaml(configYaml.trim() === "" ? "{}" : configYaml);
  const yamlConfig = WorkflowConfigYamlSchema.parse(parsed ?? {});

  return WorkflowConfigSchema.parse({
    stallTimeoutMs: yamlConfig.stall_timeout_ms,
    maxRetryBackoffMs: yamlConfig.max_retry_backoff_ms,
    keepOnFailure: yamlConfig.keepOnFailure,
    maxAttempts: yamlConfig.maxAttempts,
  });
}

export async function renderPrompt(
  workflowDef: PromptWorkflowDef,
  context: RenderPromptContext,
): Promise<string> {
  try {
    return await liquid.parseAndRender(workflowDef.promptMd, {
      issue: context.issue,
      attempt: context.attempt,
    });
  } catch (error) {
    if (error instanceof UndefinedVariableError) {
      throw new UnknownVariableError(error.message, { cause: error });
    }
    throw error;
  }
}

export async function loadWorkflowDef(
  em: EntityManager,
  orgId: string,
  projectId: string | null,
  name = "default",
): Promise<WorkflowDefinition | null> {
  const fork = em.fork();
  const repo = fork.getRepository(
    WorkflowDefinition,
  ) as WorkflowDefinitionRepository;
  const org = fork.getReference(Org, orgId);

  if (projectId !== null) {
    const projectWorkflow = await repo.findOne({
      org,
      projectId,
      name,
    });
    if (projectWorkflow) return projectWorkflow;
  }

  return repo.findOne({
    org,
    projectId: null,
    name,
  });
}
