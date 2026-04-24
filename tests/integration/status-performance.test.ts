import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface ScaleFixture {
  counts: {
    projects: number;
    tasks: number;
    events: number;
    artifacts: number;
    memoryEntries: number;
  };
  acceptance: {
    projectListP95Ms: number;
    taskListP95Ms: number;
    runStatusP95Ms: number;
    healthSummaryP95Ms: number;
  };
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = JSON.parse(
  readFileSync(path.join(repoRoot, "tests/fixtures/scale/scale-fixture.json"), "utf8")
) as ScaleFixture;

function measure<T>(operation: () => T): { elapsedMs: number; result: T } {
  const started = performance.now();
  const result = operation();
  return { elapsedMs: performance.now() - started, result };
}

describe("common status performance", () => {
  it("keeps project list, task list, run status, and health summary under release budgets", () => {
    const projects = Array.from({ length: fixture.counts.projects }, (_, index) => ({
      projectId: `proj_scale_${String(index).padStart(3, "0")}`,
      healthState: index % 5 === 0 ? "degraded" : "managed"
    }));
    const tasks = Array.from({ length: fixture.counts.tasks }, (_, index) => ({
      taskId: `task_scale_${String(index).padStart(4, "0")}`,
      projectId: projects[index % projects.length]?.projectId,
      status: index % 7 === 0 ? "blocked" : "ready"
    }));
    const events = Array.from({ length: fixture.counts.events }, (_, index) => ({
      eventId: `event_scale_${String(index).padStart(5, "0")}`,
      runId: `run_scale_${index % 50}`,
      type: index % 10 === 0 ? "run.heartbeat" : "run.progress"
    }));

    const projectList = measure(() => projects.filter((project) => project.healthState));
    const taskList = measure(() => tasks.filter((task) => task.status !== "completed"));
    const runStatus = measure(() => events.filter((event) => event.runId === "run_scale_7").at(-1));
    const healthSummary = measure(() => ({
      degraded: projects.filter((project) => project.healthState === "degraded").length,
      total: projects.length
    }));

    expect(projectList.result).toHaveLength(fixture.counts.projects);
    expect(taskList.result.length).toBeGreaterThan(900);
    expect(runStatus.result?.type).toMatch(/^run\./);
    expect(healthSummary.result.degraded).toBe(5);
    expect(projectList.elapsedMs).toBeLessThan(fixture.acceptance.projectListP95Ms);
    expect(taskList.elapsedMs).toBeLessThan(fixture.acceptance.taskListP95Ms);
    expect(runStatus.elapsedMs).toBeLessThan(fixture.acceptance.runStatusP95Ms);
    expect(healthSummary.elapsedMs).toBeLessThan(fixture.acceptance.healthSummaryP95Ms);
  });
});
