/**
 * Symphony orchestrator — state machine operations.
 *
 * Implements the Unclaimed → Claimed transition with optimistic locking.
 * The agent_runs_claimed_unique partial index (task_id WHERE orchestration_state='claimed')
 * is the only synchronization primitive — no advisory locks needed.
 *
 * C6: No raw SQL — MikroORM nativeUpdate + repository calls only.
 * C7: MikroORM v7 EntityManager operations.
 *
 * Pillar 3, slice 06 — callable from the orchestrator poll loop (wired in slice 10).
 */

import type { EntityManager } from "@mikro-orm/postgresql";

import type { AgentRunRepository } from "../../db/repositories/orchestration/AgentRunRepository.ts";
import type { EventRepository } from "../../db/repositories/core/EventRepository.ts";

export class ClaimConflictError extends Error {
  readonly taskId: string;

  constructor(taskId: string) {
    super(`Task ${taskId} is already claimed or has no unclaimed run`);
    this.name = "ClaimConflictError";
    this.taskId = taskId;
  }
}

export interface ClaimRunResult {
  runId: string;
}

/**
 * Atomically transitions an unclaimed AgentRun to claimed state.
 *
 * Uses nativeUpdate with `orchestrationState:'unclaimed'` filter — exactly one
 * row is updated when the run is available; zero rows → ClaimConflictError.
 * The agent_runs_claimed_unique partial index prevents double-dispatch as a
 * secondary guard (PG-level unique constraint).
 */
export async function claimRun(
  em: EntityManager,
  orgId: string,
  taskId: string,
  instanceId: string,
): Promise<ClaimRunResult> {
  const [{ AgentRun }, { Event }, { Org }] = await Promise.all([
    import("../../db/entities/orchestration/AgentRun.ts"),
    import("../../db/entities/core/Event.ts"),
    import("../../db/entities/auth/Org.ts"),
  ]);

  const fork = em.fork();
  const agentRunRepo = fork.getRepository(AgentRun) as AgentRunRepository;
  const eventsRepo = fork.getRepository(Event) as EventRepository;
  const org = fork.getReference(Org, orgId);

  // Optimistic lock: UPDATE ... WHERE orchestration_state='unclaimed' AND task_id=taskId
  // The partial unique index agent_runs_claimed_unique backs this as a DB-level guard.
  const updatedCount = await agentRunRepo.nativeUpdate(
    {
      org: orgId,
      task: taskId,
      orchestrationState: "unclaimed",
    } as never,
    {
      orchestrationState: "claimed",
      claimedBy: instanceId,
    } as never,
  );

  if (updatedCount === 0) {
    throw new ClaimConflictError(taskId);
  }

  // Fetch the run we just claimed to get its ID for the event.
  const claimed = await agentRunRepo.findOneOrFail(
    {
      org: orgId,
      task: taskId,
      orchestrationState: "claimed",
    } as never,
    { fields: ["id"] },
  );

  eventsRepo.create({
    org,
    subjectKind: "agent_run",
    subjectId: claimed.id,
    verb: "state_changed",
    payload: { from: "unclaimed", to: "claimed" },
  });

  await fork.flush();

  return { runId: claimed.id };
}
