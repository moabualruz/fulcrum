import type { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";

import type { AgentRunRepository } from "@execution-orchestration/infrastructure/database/repositories/orchestration/AgentRunRepository.ts";
import type { EventRepository } from "@platform-core/infrastructure/application-database/repositories/core/EventRepository.ts";
import { ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import type { OrchestrationApplicationContext } from "@execution-orchestration/application/orchestration/types.ts";
import type { OrchestrationConfigRow, WorkflowDefRow } from "@execution-orchestration/application/orchestration/queries.ts";

export class OrchestrationStateMutationConflict extends Error {
  constructor(public readonly taskId: string) {
    super(`Task ${taskId} is already claimed or has no matching run`);
    this.name = "OrchestrationStateMutationConflict";
  }
}

export interface ClaimRunStateResult {
  runId: string;
}

export async function claimRunState(
  em: EntityManager,
  orgId: string,
  taskId: string,
  instanceId: string,
): Promise<ClaimRunStateResult> {
  const [{ AgentRun }, { Event }, { Org }] = await Promise.all([
    import("@execution-orchestration/infrastructure/database/entities/orchestration/AgentRun.ts"),
    import("@platform-core/infrastructure/application-database/entities/core/Event.ts"),
    import("@identity-access/infrastructure/database/entities/auth/Org.ts"),
  ]);

  return await em.transaction(async (tx) => {
    const agentRunRepo = tx.getRepository(AgentRun);
    const candidate = await agentRunRepo.findOne({
      where: { org: { id: orgId }, task: { id: taskId }, orchestrationState: "unclaimed" } as never,
      order: { createdAt: "ASC", id: "ASC" },
      select: ["id", "createdAt"],
    });
    if (!candidate) throw new OrchestrationStateMutationConflict(taskId);

    const result = await agentRunRepo.update(
      { id: candidate.id, orchestrationState: "unclaimed" } as never,
      { orchestrationState: "claimed", claimedBy: instanceId } as never,
    );
    // PGlite doesn't return affected count; verify the update took effect
    if (result.affected !== undefined && result.affected === 0) {
      throw new OrchestrationStateMutationConflict(taskId);
    }
    if (result.affected === undefined) {
      const verify = await agentRunRepo.findOne({ where: { id: candidate.id, orchestrationState: "claimed" } as never });
      if (!verify) throw new OrchestrationStateMutationConflict(taskId);
    }

    await tx.save(Event, {
      org: { id: orgId } as typeof Org.prototype,
      subjectKind: "agent_run",
      subjectId: candidate.id,
      verb: "state_changed",
      payload: { from: "unclaimed", to: "claimed" },
      createdAt: new Date(),
    });
    return { runId: candidate.id };
  });
}

export interface RunRetryStateRef {
  id: string;
  orgId: string;
  attemptCount: number;
  orchestrationState: string;
}

export async function transitionRunForRetry(
  em: EntityManager,
  run: RunRetryStateRef,
  input: {
    nextState: string;
    nextAttempt: number;
    nextRetryAt: Date | null;
    lastErrorKind: string;
    exhausted: boolean;
    now: Date;
  },
): Promise<void> {
  const [{ AgentRun }, { Event }, { Org }] = await Promise.all([
    import("@execution-orchestration/infrastructure/database/entities/orchestration/AgentRun.ts"),
    import("@platform-core/infrastructure/application-database/entities/core/Event.ts"),
    import("@identity-access/infrastructure/database/entities/auth/Org.ts"),
  ]);
  await em.transaction(async (tx) => {
    const params: unknown[] = [input.nextState, input.nextAttempt, input.nextRetryAt, input.lastErrorKind];
    let sql = `UPDATE agent_runs SET orchestration_state = $1, attempt_count = $2, next_retry_at = $3, last_error_kind = $4`;
    if (input.exhausted) {
      params.push("failed");
      sql += `, status = $${params.length}`;
    }
    params.push(run.id, run.orchestrationState);
    sql += ` WHERE id = $${params.length - 1} AND orchestration_state = $${params.length}`;
    await tx.query(sql, params);
    // Verify update took effect (PGlite doesn't return affected count)
    const agentRunRepo = tx.getRepository(AgentRun);
    const verify = await agentRunRepo.findOne({ where: { id: run.id, orchestrationState: input.nextState } as never });
    if (!verify) return;
    await tx.save(Event, {
      org: { id: run.orgId } as typeof Org.prototype,
      subjectKind: "agent_run",
      subjectId: run.id,
      verb: "state_changed",
      payload: { from: run.orchestrationState, to: input.nextState },
      createdAt: input.now,
    });
  });
}

export async function upsertOrchestrationConfig(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
  config: {
    pollIntervalS: number;
    maxConcurrency: number;
    stallTimeoutS: number;
    workspaceRoot: string | null;
  },
): Promise<OrchestrationConfigRow> {
  const rows = await ormSqlConnection(em).execute<OrchestrationConfigRow[]>(
    `INSERT INTO orchestration_config (id, org_id, poll_interval_s, max_concurrency, stall_timeout_s, workspace_root, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, now())
     ON CONFLICT (org_id) DO UPDATE SET
       poll_interval_s = EXCLUDED.poll_interval_s,
       max_concurrency = EXCLUDED.max_concurrency,
       stall_timeout_s = EXCLUDED.stall_timeout_s,
       workspace_root = EXCLUDED.workspace_root,
       updated_at = now()
     RETURNING *`,
    [ctx.orgId, config.pollIntervalS, config.maxConcurrency, config.stallTimeoutS, config.workspaceRoot],
  );
  return rows[0]!;
}

export async function upsertWorkflowDef(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
  def: {
    id?: string;
    projectId?: string | null;
    name: string;
    description?: string | null;
    yamlConfig: string;
    promptTemplate: string;
  },
): Promise<WorkflowDefRow> {
  const id = def.id ?? randomUUID();
  const rows = await ormSqlConnection(em).execute<WorkflowDefRow[]>(
    `INSERT INTO workflow_defs (id, org_id, project_id, name, description, yaml_config, prompt_template, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       yaml_config = EXCLUDED.yaml_config,
       prompt_template = EXCLUDED.prompt_template,
       updated_at = now()
     RETURNING *`,
    [id, ctx.orgId, def.projectId ?? null, def.name, def.description ?? null, def.yamlConfig, def.promptTemplate],
  );
  return rows[0]!;
}
