import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";

import type { AgentRunRepository } from "@platform-core/infrastructure/application-database/repositories/orchestration/AgentRunRepository.ts";
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
    import("@platform-core/infrastructure/application-database/entities/orchestration/AgentRun.ts"),
    import("@platform-core/infrastructure/application-database/entities/core/Event.ts"),
    import("@platform-core/infrastructure/application-database/entities/auth/Org.ts"),
  ]);

  const fork = em.fork();
  return await fork.transactional(async (tx) => {
    const agentRunRepo = tx.getRepository(AgentRun) as AgentRunRepository;
    const eventsRepo = tx.getRepository(Event) as EventRepository;
    const org = tx.getReference(Org, orgId);
    const candidate = await agentRunRepo.findOne(
      {
        org: orgId,
        task: taskId,
        orchestrationState: "unclaimed",
      } as never,
      { orderBy: { createdAt: "ASC", id: "ASC" }, fields: ["id"] },
    );
    if (!candidate) throw new OrchestrationStateMutationConflict(taskId);

    const updatedCount = await agentRunRepo.nativeUpdate(
      { id: candidate.id, orchestrationState: "unclaimed" } as never,
      { orchestrationState: "claimed", claimedBy: instanceId } as never,
    );
    if (updatedCount === 0) throw new OrchestrationStateMutationConflict(taskId);

    eventsRepo.create({
      org,
      subjectKind: "agent_run",
      subjectId: candidate.id,
      verb: "state_changed",
      payload: { from: "unclaimed", to: "claimed" },
      createdAt: new Date(),
    });
    await tx.flush();
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
    import("@platform-core/infrastructure/application-database/entities/orchestration/AgentRun.ts"),
    import("@platform-core/infrastructure/application-database/entities/core/Event.ts"),
    import("@platform-core/infrastructure/application-database/entities/auth/Org.ts"),
  ]);
  const fork = em.fork();
  await fork.transactional(async (tx) => {
    const agentRunRepo = tx.getRepository(AgentRun);
    const eventsRepo = tx.getRepository(Event);
    const org = tx.getReference(Org, run.orgId);
    const updatedCount = await agentRunRepo.nativeUpdate(
      {
        id: run.id,
        org: run.orgId,
        orchestrationState: run.orchestrationState,
      } as never,
      {
        orchestrationState: input.nextState,
        ...(input.exhausted ? { status: "failed" } : {}),
        attemptCount: input.nextAttempt,
        nextRetryAt: input.nextRetryAt,
        lastErrorKind: input.lastErrorKind,
      } as never,
    );
    if (updatedCount === 0) return;
    eventsRepo.create({
      org,
      subjectKind: "agent_run",
      subjectId: run.id,
      verb: "state_changed",
      payload: { from: run.orchestrationState, to: input.nextState },
      createdAt: input.now,
    });
    await tx.flush();
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
