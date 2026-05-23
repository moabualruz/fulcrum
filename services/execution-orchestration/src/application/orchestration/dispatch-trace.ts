import type { EntityManager } from "typeorm";

import { AppValidationError } from "@platform-core/domain/errors.ts";
import { ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import { previewContext, type ContextSourceRef } from "@knowledge-workspace/application/context/queries.ts";
import {
  normalizeToolPermissionMode,
  projectPolicySourceFromModulePolicy,
  resolveEffectiveAgentAuthority,
  trustModeFromToolPermissionMode,
  type ToolPermissionMode,
} from "@work-management/application/project-policy/trust.ts";
import type { AppContext } from "@execution-orchestration/application/runs/types.ts";

export type DispatchTrustMode = "manual" | "assisted" | "trusted" | "full-auto";

export interface DispatchTrace {
  taskId: string;
  projectId: string;
  repoId: string;
  context: {
    sourceRefs: ContextSourceRef[];
    includeGlobal: boolean;
  };
  routing: {
    selectedAgent: string;
    reason: "explicit-agent" | "default-agent";
  };
  authority: {
    trustMode: DispatchTrustMode;
    permissionMode: ToolPermissionMode;
    approvalRequired: boolean;
    reason: string;
    sources: Record<string, DispatchTrustMode | null>;
  };
}

export async function buildDispatchTrace(
  em: EntityManager,
  ctx: AppContext,
  input: {
    taskId: string;
    projectId?: string | null;
    agentName?: string | null;
    includeGlobal?: boolean;
    trustMode?: DispatchTrustMode;
    permissionMode?: ToolPermissionMode;
  },
): Promise<DispatchTrace> {
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<Array<{ project_id: string | null; repo_id: string | null }>>(
    `SELECT project_id, repo_id FROM tasks WHERE id = $1 AND org_id = $2`,
    [input.taskId, ctx.orgId],
  );
  const task = rows[0];
  if (!task) throw new AppValidationError(`Task not found: ${input.taskId}`);
  const projectId = input.projectId ?? task.project_id;
  if (!projectId) throw new AppValidationError("Dispatch requires task project trace.");
  if (task.project_id && input.projectId && task.project_id !== input.projectId) {
    throw new AppValidationError("Dispatch project does not match task project.");
  }
  if (!task.repo_id) throw new AppValidationError("Dispatch requires task repo trace.");
  const projectPolicy = await loadProjectAuthorityPolicy(em, ctx, projectId);

  const includeGlobal = input.includeGlobal ?? false;
  const contextPreview = await previewContext(em, ctx, {
    projectId,
    taskId: input.taskId,
    includeGlobal,
  });
  const selectedAgent = input.agentName?.trim() || "codex";
  const requestedPermissionMode = input.permissionMode ? normalizeToolPermissionMode(input.permissionMode) : null;
  const authority = resolveEffectiveAgentAuthority({
    agentProfile: { trustMode: "assisted" },
    workflowDefault: { trustMode: "assisted" },
    projectPolicy,
    runOverride: requestedPermissionMode
      ? { trustMode: trustModeFromToolPermissionMode(requestedPermissionMode) }
      : input.trustMode ? { trustMode: input.trustMode } : null,
  });
  return {
    taskId: input.taskId,
    projectId,
    repoId: task.repo_id,
    context: {
      sourceRefs: contextPreview.sourceRefs,
      includeGlobal,
    },
    routing: {
      selectedAgent,
      reason: input.agentName?.trim() ? "explicit-agent" : "default-agent",
    },
    authority: {
      trustMode: authority.trustMode,
      permissionMode: authority.permissionMode,
      approvalRequired: authority.approvalRequired,
      reason: authority.reason,
      sources: authority.sources,
    },
  };
}

async function loadProjectAuthorityPolicy(
  em: EntityManager,
  ctx: AppContext,
  projectId: string,
): Promise<{ trustMode: DispatchTrustMode }> {
  const rows = await ormSqlConnection(em).execute<Array<{ module_policy: Record<string, unknown> | string | null }>>(
    `SELECT module_policy FROM projects WHERE id = $1 AND org_id = $2`,
    [projectId, ctx.orgId],
  );
  const modulePolicy = objectValue(rows[0]?.module_policy);
  return projectPolicySourceFromModulePolicy(modulePolicy) as { trustMode: DispatchTrustMode };
}

function objectValue(value: Record<string, unknown> | string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return value;
}
