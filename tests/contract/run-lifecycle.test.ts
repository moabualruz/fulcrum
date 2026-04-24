import { describe, expect, it } from "vitest";
import { LocalTaskService, RunLifecycleService, type RunRepositoryPort } from "@fulcrum/core";
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
  list(projectId?: string): Run[] {
    return [...this.runs.values()].filter((run) => !projectId || run.projectId === projectId);
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

describe("run lifecycle contract", () => {
  it("starts, heartbeats, completes, and rejects terminal mutation", () => {
    const taskRepo = new MemoryTaskRepository();
    const tasks = new LocalTaskService(taskRepo);
    const task = tasks.create({ projectId: "proj_01", title: "Run me" });
    tasks.transition(task.taskId, "ready");
    const runs = new RunLifecycleService(new MemoryRunRepository(), taskRepo);

    const run = runs.start({ taskId: task.taskId, agentId: "adapter_validation" });
    const heartbeat = runs.heartbeat(run.runId, { source: "validation", message: "alive" });
    const completed = runs.complete(run.runId, { summary: "done", outcome: "succeeded" });

    expect(run.status).toBe("running");
    expect(heartbeat.heartbeatState).toBe("fresh");
    expect(completed.status).toBe("completed");
    expect(taskRepo.get(task.taskId)?.currentRunId).toBe(run.runId);
    expect(() => runs.cancel(run.runId)).toThrow(/terminal/);
  });
});
