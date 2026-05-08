import type { EntityManager } from "@mikro-orm/postgresql";

import { AppValidationError } from "../errors.ts";
import { ormSqlConnection } from "../orm-helpers.ts";
import { previewContext, type ContextSourceRef } from "../context/queries.ts";
import type { AppContext } from "../runs/types.ts";

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
    approvalRequired: boolean;
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

  const includeGlobal = input.includeGlobal ?? false;
  const contextPreview = await previewContext(em, ctx, {
    projectId,
    taskId: input.taskId,
    includeGlobal,
  });
  const selectedAgent = input.agentName?.trim() || "codex";
  const trustMode = input.trustMode ?? "assisted";
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
      trustMode,
      approvalRequired: trustMode === "manual",
    },
  };
}
