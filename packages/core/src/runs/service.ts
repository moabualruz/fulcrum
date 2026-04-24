import {
  makeId,
  RunSchema,
  SCHEMA_VERSION,
  terminalRunStatuses,
  type Run,
  type RunEvent,
  type Task
} from "@fulcrum/shared";
import type { TaskRepositoryPort } from "../tasks/service.js";
import type { WorktreeAllocationService } from "../worktrees/allocation.js";
import type { WorktreeRepositoryPort } from "../worktrees/status.js";
import type { GraphLinkWriters } from "../graph/link-writers.js";
import type { QualityReadinessEvaluator } from "../quality/readiness.js";

export interface RunRepositoryPort {
  save(run: Run): Run;
  get(runId: string): Run | undefined;
  list(projectId?: string): Run[];
  appendEvent(event: Omit<RunEvent, "sequence">): RunEvent;
  listEvents(runId: string): RunEvent[];
}

export interface StartRunInput {
  taskId: string;
  agentId: string;
  commandIdentity?: string;
  worktreeId?: string;
  contextPackId?: string;
  allocateWorktree?: boolean;
}

function isTerminal(status: Run["status"]): boolean {
  return (terminalRunStatuses as readonly string[]).includes(status);
}

function mergeIds(current: string[], next: string[] = []): string[] {
  return [...new Set([...current, ...next])];
}

export class RunLifecycleService {
  constructor(
    private readonly runs: RunRepositoryPort,
    private readonly tasks: Pick<TaskRepositoryPort, "get" | "save">,
    private readonly worktreeAllocator?: WorktreeAllocationService,
    private readonly worktrees?: WorktreeRepositoryPort,
    private readonly graphLinks?: GraphLinkWriters,
    private qualityReadiness?: QualityReadinessEvaluator
  ) {}

  setQualityReadiness(readiness: QualityReadinessEvaluator): void {
    this.qualityReadiness = readiness;
  }

  start(input: StartRunInput): Run {
    const task = this.requireTask(input.taskId);
    if (task.status !== "ready") {
      throw new Error(`Task must be ready before run start: ${task.taskId}`);
    }
    const now = new Date().toISOString();
    const runId = makeId("run", `${task.taskId}-${input.agentId}-${now}`);
    const allocatedWorktreeId =
      input.worktreeId ??
      (input.allocateWorktree === false || !this.worktreeAllocator
        ? undefined
        : this.worktreeAllocator.allocate({ taskId: task.taskId, runId }).worktreeId);
    const run = this.runs.save(
      RunSchema.parse({
        runId,
        taskId: task.taskId,
        projectId: task.projectId,
        agentId: input.agentId,
        commandIdentity: input.commandIdentity ?? input.agentId,
        status: "running",
        startedAt: now,
        heartbeatState: "missing",
        worktreeId: allocatedWorktreeId,
        contextPackId: input.contextPackId,
        eventStreamId: makeId("evt", `${task.taskId}-${now}`),
        logArtifactIds: [],
        artifactIds: [],
        qualityGateIds: [],
        policyDecisionIds: [],
        redactionStatus: "not_applicable",
        createdAt: now,
        updatedAt: now,
        schemaVersion: SCHEMA_VERSION
      })
    );
    this.tasks.save({ ...task, status: "running", currentRunId: run.runId, updatedAt: now });
    if (allocatedWorktreeId && this.worktrees) {
      const worktree = this.worktrees.get(allocatedWorktreeId);
      if (worktree) {
        this.worktrees.save({ ...worktree, runId: run.runId, status: "active", updatedAt: now });
      }
    }
    this.append(run, "run.created", "Run created.", "info");
    this.append(run, "run.started", "Run supervision started.", "info");
    this.graphLinks?.run(run);
    return run;
  }

  heartbeat(runId: string, input: { source: string; message: string; progress?: number }): Run {
    const run = this.requireMutableRun(runId);
    const now = new Date().toISOString();
    const updated = this.runs.save({
      ...run,
      heartbeatAt: now,
      heartbeatState: "fresh",
      updatedAt: now
    });
    this.append(updated, "run.heartbeat", input.message, "info", {
      source: input.source,
      progress: input.progress
    });
    return updated;
  }

  progress(runId: string, input: { source: string; message: string }): RunEvent {
    const run = this.requireMutableRun(runId);
    return this.append(run, "run.progress", input.message, "info", { source: input.source });
  }

  markStale(runId: string, reason: string): Run {
    const run = this.requireMutableRun(runId);
    const updated = this.runs.save({
      ...run,
      heartbeatState: "stale",
      updatedAt: new Date().toISOString()
    });
    this.append(updated, "run.stale_detected", reason, "warn");
    return updated;
  }

  recordCrash(runId: string, reason: string): Run {
    const run = this.requireMutableRun(runId);
    return this.toTerminal(run, "failed", "run.failed", reason, {
      failureReason: reason,
      finalOutcome: "failed"
    });
  }

  cancel(runId: string, reason = "operator requested cancellation"): Run {
    const run = this.requireMutableRun(runId);
    const requested = this.runs.save({
      ...run,
      status: "cancel_requested",
      updatedAt: new Date().toISOString()
    });
    this.append(requested, "run.cancel_requested", reason, "warn");
    return this.toTerminal(requested, "cancelled", "run.cancelled", reason, {
      finalOutcome: "cancelled"
    });
  }

  complete(
    runId: string,
    input: {
      summary: string;
      outcome: "succeeded" | "failed";
      artifactIds?: string[];
      logArtifactIds?: string[];
      qualityGateIds?: string[];
      policyDecisionIds?: string[];
    }
  ): Run {
    const run = this.requireMutableRun(runId);
    const artifactIds = mergeIds(run.artifactIds, input.artifactIds);
    const logArtifactIds = mergeIds(run.logArtifactIds, input.logArtifactIds);
    const qualityGateIds = mergeIds(run.qualityGateIds, input.qualityGateIds);
    const policyDecisionIds = mergeIds(run.policyDecisionIds, input.policyDecisionIds);
    if (input.outcome === "succeeded" && this.qualityReadiness) {
      const readiness = this.qualityReadiness.evaluate({
        projectId: run.projectId,
        runId: run.runId,
        taskId: run.taskId
      });
      if (readiness.status === "blocked") {
        this.append(run, "quality.completed", readiness.summary, "warn", {
          blockingGateIds: readiness.blockingGateIds,
          requiredGateIds: readiness.requiredGateIds
        });
        throw new Error(`Run completion blocked: ${readiness.summary}`);
      }
    }
    if (input.outcome === "failed") {
      const failed = this.toTerminal(run, "failed", "run.failed", input.summary, {
        summary: input.summary,
        failureReason: input.summary,
        finalOutcome: input.outcome,
        artifactIds,
        logArtifactIds,
        qualityGateIds,
        policyDecisionIds
      });
      this.graphLinks?.run(failed);
      return failed;
    }
    const succeeded = this.runs.save({
      ...run,
      status: "succeeded",
      summary: input.summary,
      finalOutcome: input.outcome,
      artifactIds,
      logArtifactIds,
      qualityGateIds,
      policyDecisionIds,
      updatedAt: new Date().toISOString()
    });
    const completed = this.toTerminal(succeeded, "completed", "run.completed", input.summary, {
      summary: input.summary,
      finalOutcome: input.outcome
    });
    this.graphLinks?.run(completed);
    return completed;
  }

  get(runId: string): Run | undefined {
    return this.runs.get(runId);
  }

  list(projectId?: string): Run[] {
    return this.runs.list(projectId);
  }

  events(runId: string): RunEvent[] {
    return this.runs.listEvents(runId);
  }

  appendEvent(event: Omit<RunEvent, "sequence">): RunEvent {
    return this.runs.appendEvent(event);
  }

  private toTerminal(
    run: Run,
    status: "cancelled" | "failed" | "completed",
    eventType: RunEvent["type"],
    message: string,
    patch: Partial<Run> = {}
  ): Run {
    if (isTerminal(run.status)) {
      throw new Error(`Run already terminal: ${run.runId}`);
    }
    const now = new Date().toISOString();
    const updated = this.runs.save({
      ...run,
      ...patch,
      status,
      endedAt: now,
      terminalStateRecordedAt: now,
      updatedAt: now
    });
    this.append(updated, eventType, message, status === "failed" ? "error" : "info");
    return updated;
  }

  private requireTask(taskId: string): Task {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  private requireMutableRun(runId: string): Run {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    if (isTerminal(run.status)) {
      throw new Error(`Run already terminal: ${runId}`);
    }
    return run;
  }

  private append(
    run: Run,
    type: RunEvent["type"],
    message: string,
    severity: RunEvent["severity"],
    extra: Record<string, unknown> = {}
  ): RunEvent {
    return this.runs.appendEvent({
      eventId: makeId("evt", `${run.runId}-${type}-${Date.now()}-${Math.random()}`),
      timestamp: new Date().toISOString(),
      source: "core.run-lifecycle",
      severity,
      type,
      projectId: run.projectId,
      taskId: run.taskId,
      runId: run.runId,
      payloadSummary: { message, ...extra },
      payloadRef: null,
      artifactRefs: [],
      policyDecisionRefs: [],
      redactionStatus: "not_applicable",
      degraded: [],
      schemaVersion: SCHEMA_VERSION
    });
  }
}
