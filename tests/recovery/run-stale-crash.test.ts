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

describe("run stale heartbeat and crash recovery", () => {
  it("marks stale active runs truthfully without assuming clean workspace", () => {
    const taskRepo = new MemoryTaskRepository();
    const tasks = new LocalTaskService(taskRepo);
    const task = tasks.create({ projectId: "proj_01", title: "Crash recovery" });
    tasks.transition(task.taskId, "ready");
    const repository = new MemoryRunRepository();
    const runs = new RunLifecycleService(repository, taskRepo);
    const run = runs.start({ taskId: task.taskId, agentId: "adapter_validation" });

    runs.markStale(run.runId, "heartbeat timeout");
    runs.recordCrash(run.runId, "process exited 1");

    const recovered = repository.get(run.runId);
    expect(recovered?.status).toBe("failed");
    expect(recovered?.heartbeatState).toBe("stale");
    expect(recovered?.failureReason).toContain("process exited");
    expect(repository.listEvents(run.runId).map((event) => event.type)).toEqual(
      expect.arrayContaining(["run.stale_detected", "run.failed"])
    );
  });

  it("records process crashes through supervised process outcome", async () => {
    const taskRepo = new MemoryTaskRepository();
    const tasks = new LocalTaskService(taskRepo);
    const task = tasks.create({ projectId: "proj_01", title: "Crash supervised process" });
    tasks.transition(task.taskId, "ready");
    const repository = new MemoryRunRepository();
    const runs = new RunLifecycleService(repository, taskRepo);
    const run = runs.start({ taskId: task.taskId, agentId: "adapter_validation" });

    const supervised = startSupervisedProcess(
      process.execPath,
      ["-e", "process.stderr.write('boom\\n'); process.exit(2)"],
      process.cwd(),
      {
        onOutcome: (outcome) => {
          if (outcome.status === "failed") {
            runs.recordCrash(run.runId, outcome.summary);
          }
        }
      }
    );
    const outcome = await supervised.done;

    expect(outcome.status).toBe("failed");
    expect(outcome.exitCode).toBe(2);
    expect(outcome.transcript).toEqual(["stderr: boom"]);
    expect(repository.get(run.runId)?.status).toBe("failed");
    expect(repository.listEvents(run.runId).map((event) => event.type)).toContain("run.failed");
  });
});
