import { describe, expect, it } from "vitest";

describe("two configured agent lifecycle", () => {
  it("keeps shared task, run, context, artifact, quality, and policy state attributable per agent", () => {
    const task = { taskId: "task_shared", status: "in_progress" };
    const agents = ["agent_alpha", "agent_beta"];
    const runs = agents.map((agentId, index) => ({
      runId: `run_${index}`,
      taskId: task.taskId,
      agentId,
      contextPackId: `ctx_${index}`,
      artifactIds: [`artifact_${index}`],
      qualityGateIds: [`quality_${index}`],
      policyDecisionIds: [`policy_${index}`],
      status: "completed"
    }));

    expect(new Set(runs.map((run) => run.taskId))).toEqual(new Set([task.taskId]));
    expect(new Set(runs.map((run) => run.agentId))).toEqual(new Set(agents));
    expect(runs.flatMap((run) => run.contextPackId)).toHaveLength(2);
    expect(runs.flatMap((run) => run.artifactIds)).toHaveLength(2);
    expect(runs.flatMap((run) => run.qualityGateIds)).toHaveLength(2);
    expect(runs.flatMap((run) => run.policyDecisionIds)).toHaveLength(2);
  });
});
