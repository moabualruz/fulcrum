import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LocalTaskService,
  RunLifecycleService,
  type RunRepositoryPort,
  captureRunTranscript
} from "@fulcrum/core";
import { runValidationAgent } from "@fulcrum/agents";
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

describe("deterministic validation agent run", () => {
  it("emits heartbeat, writes file, captures transcript, and completes", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-validation-run-"));
    mkdirSync(root, { recursive: true });
    const taskRepo = new MemoryTaskRepository();
    const tasks = new LocalTaskService(taskRepo);
    const task = tasks.create({ projectId: "proj_01", title: "Edit README" });
    tasks.transition(task.taskId, "ready");
    const repository = new MemoryRunRepository();
    const runs = new RunLifecycleService(repository, taskRepo);
    const run = runs.start({ taskId: task.taskId, agentId: "adapter_validation", worktreeId: "wt_01" });

    const result = await runValidationAgent({
      run,
      worktreePath: root,
      onHeartbeat: (message) => runs.heartbeat(run.runId, { source: "validation-agent", message }),
      onProgress: (message) => runs.progress(run.runId, { source: "validation-agent", message })
    });
    const transcript = captureRunTranscript({
      runId: run.runId,
      logRoot: root,
      lines: result.transcript
    });
    const completed = runs.complete(run.runId, {
      summary: result.summary,
      outcome: "succeeded",
      artifactIds: [transcript.artifactId],
      logArtifactIds: [transcript.artifactId]
    });

    expect(completed.status).toBe("completed");
    expect(completed.logArtifactIds).toContain(transcript.artifactId);
    expect(readFileSync(path.join(root, "validation-agent-output.txt"), "utf8")).toContain(run.runId);
    expect(repository.listEvents(run.runId).map((event) => event.type)).toContain("run.heartbeat");
    expect(transcript.localRef.endsWith("transcript.log")).toBe(true);
    expect(transcript.hash).toBe(
      `sha256:${createHash("sha256").update(result.transcript.join("\n")).digest("hex")}`
    );
  });
});
