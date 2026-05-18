import { describe, expect, test } from "bun:test";

import {
  buildManualSimulationChecklist,
  recordManualSimulationStepResult,
} from "@planning-review/application/manual-simulation-checklist.ts";
import type { FinalQaTaskResult } from "@planning-review/domain/review-acceptance.ts";

describe("manual simulation checklist", () => {
  test("derives user-visible checklist steps from success criteria", () => {
    const checklist = buildManualSimulationChecklist({
      projectId: "project-1",
      traceId: "trace-1",
      tasks: [taskResult({
        taskId: "task-1",
        title: "Approve build plan",
        successCriteria: [
          "User sees the pending approval.",
          "User approves the plan and sees the handoff.",
        ],
      })],
    });

    expect(checklist).toMatchObject({
      id: "manual-simulation:trace-1",
      projectId: "project-1",
      traceId: "trace-1",
      status: "pending",
      e2eSeed: {
        sourceTaskIds: ["task-1"],
        sourceCriteria: [
          "User sees the pending approval.",
          "User approves the plan and sees the handoff.",
        ],
        approvedForE2e: false,
      },
    });
    expect(checklist.steps).toEqual([
      {
        id: "task-1:manual-simulation:1",
        taskId: "task-1",
        taskTitle: "Approve build plan",
        criterion: "User sees the pending approval.",
        setup: "Open the workflow state for Approve build plan.",
        action: "Exercise the user-visible path for success criterion 1.",
        expectedObservation: "User sees the pending approval.",
        evidenceField: "evidence.task-1.1",
      },
      {
        id: "task-1:manual-simulation:2",
        taskId: "task-1",
        taskTitle: "Approve build plan",
        criterion: "User approves the plan and sees the handoff.",
        setup: "Open the workflow state for Approve build plan.",
        action: "Exercise the user-visible path for success criterion 2.",
        expectedObservation: "User approves the plan and sees the handoff.",
        evidenceField: "evidence.task-1.2",
      },
    ]);
  });

  test("failed step creates a blocking feedback annotation with evidence", () => {
    const checklist = buildManualSimulationChecklist({
      projectId: "project-1",
      tasks: [taskResult({
        taskId: "task-1",
        title: "Approve build plan",
        successCriteria: ["User approves the plan and sees the handoff."],
      })],
    });

    const result = recordManualSimulationStepResult({
      checklist,
      stepId: "task-1:manual-simulation:1",
      status: "failed",
      evidence: "Approval button stayed disabled.",
    });

    expect(result).toEqual({
      stepId: "task-1:manual-simulation:1",
      status: "failed",
      evidence: "Approval button stayed disabled.",
      feedbackAnnotation: {
        id: "task-1:manual-simulation:1:feedback",
        stepId: "task-1:manual-simulation:1",
        taskId: "task-1",
        title: "Manual simulation failed: Approve build plan",
        body: [
          "Criterion: User approves the plan and sees the handoff.",
          "Expected observation: User approves the plan and sees the handoff.",
          "Evidence: Approval button stayed disabled.",
        ].join("\n"),
        severity: "blocking",
      },
    });
  });
});

function taskResult(input: Pick<FinalQaTaskResult, "taskId" | "title" | "successCriteria">): FinalQaTaskResult {
  return {
    ...input,
    status: "in_progress",
    latestVerdict: "APPROVE",
    latestReviewEventId: "review-1",
    unresolvedDependencyIds: [],
    runIds: ["run-1"],
    openFeedbackRunIds: [],
    artifactIds: ["artifact-1"],
  };
}
