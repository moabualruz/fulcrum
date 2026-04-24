import { describe, expect, it } from "vitest";
import { LocalTaskService, RunLifecycleService, type RunRepositoryPort } from "@fulcrum/core";
import { startSupervisedProcess } from "@fulcrum/agents";
import type { Run, RunEvent, Task } from "@fulcrum/shared";

class MemoryRunRepository implements RunRepositoryPort {
  runs = new Map<string, Run>();
  events: RunEvent[] = [];
  save(run: Run): Run {
    this.runs.set(run.runId, run);
    return run;
  }
  get(runId: string): Run | undefined {
    return this.runs.get(runId);
  }
  list(): Run[] {
    return [...this.runs.values()];
  }
  appendEvent(event: Omit<RunEvent, "sequence">): RunEvent {
    const saved = { ...event, sequence: this.events.length };
    this.events.push(saved);
    return saved;
  }
  listEvents(runId: string): RunEvent[] {
    return this.events.filter((event) => event.runId === runId);
  }
}

class MemoryTaskRepository {
  tasks = new Map<string, Task>();
  save(task: Task): Task {
    this.tasks.set(task.taskId, task);
    return task;
  }
  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }
  list(): Task[] {
    return [...this.tasks.values()];
  }
}

describe("run cancellation", () => {
  it("records cancellation request and reaches one terminal state", () => {
    const taskRepo = new MemoryTaskRepository();
    const tasks = new LocalTaskService(taskRepo);
    const task = tasks.create({ projectId: "proj_01", title: "Cancel me" });
    tasks.transition(task.taskId, "ready");
    const repository = new MemoryRunRepository();
    const runs = new RunLifecycleService(repository, taskRepo);
    const run = runs.start({ taskId: task.taskId, agentId: "adapter_validation" });

    const cancelled = runs.cancel(run.runId, "operator requested");

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.terminalStateRecordedAt).toBeDefined();
    expect(() => runs.complete(run.runId, { summary: "late", outcome: "succeeded" })).toThrow(/terminal/);
    expect(repository.listEvents(run.runId).map((event) => event.type)).toEqual([
      "run.created",
      "run.started",
      "run.cancel_requested",
      "run.cancelled"
    ]);
  });

  it("supervisor cancellation records one cancelled outcome", async () => {
    const taskRepo = new MemoryTaskRepository();
    const tasks = new LocalTaskService(taskRepo);
    const task = tasks.create({ projectId: "proj_01", title: "Cancel supervised process" });
    tasks.transition(task.taskId, "ready");
    const repository = new MemoryRunRepository();
    const runs = new RunLifecycleService(repository, taskRepo);
    const run = runs.start({ taskId: task.taskId, agentId: "adapter_validation" });
    const outcomes: string[] = [];

    const supervised = startSupervisedProcess(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      process.cwd(),
      {
        killTimeoutMs: 500,
        onOutcome: (outcome) => {
          outcomes.push(outcome.status);
          if (outcome.status === "cancelled") {
            runs.cancel(run.runId, outcome.cancelReason);
          }
        }
      }
    );

    expect(supervised.cancel("operator requested")).toBe(true);
    const outcome = await supervised.done;

    expect(outcome.status).toBe("cancelled");
    expect(outcomes).toEqual(["cancelled"]);
    expect(repository.get(run.runId)?.status).toBe("cancelled");
    expect(() => runs.recordCrash(run.runId, "late exit")).toThrow(/terminal/);
  });
});
