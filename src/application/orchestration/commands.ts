import type { EntityManager } from "@mikro-orm/postgresql";

import type { AgentRunRepository } from "../../db/repositories/orchestration/AgentRunRepository.ts";
import type { EventRepository } from "../../db/repositories/core/EventRepository.ts";

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
    import("../../db/entities/orchestration/AgentRun.ts"),
    import("../../db/entities/core/Event.ts"),
    import("../../db/entities/auth/Org.ts"),
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
    import("../../db/entities/orchestration/AgentRun.ts"),
    import("../../db/entities/core/Event.ts"),
    import("../../db/entities/auth/Org.ts"),
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
