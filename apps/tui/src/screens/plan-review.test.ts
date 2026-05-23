import { describe, expect, test } from "bun:test";

import { Renderer } from "../renderer.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import { PlanReviewScreen, type PlanReviewScreenOptions } from "./plan-review.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 140, rows: 50 });
  render(new Renderer(tty));
  return tty.plainText();
}

describe("PlanReviewScreen", () => {
  test("renders workflow stages with trace, run, task, and review ids", async () => {
    const screen = new PlanReviewScreen({
      state: {
        projectId: "project-workflow",
        planId: "plan-agent-review",
        traceId: "trace-workflow",
        stages: [
          {
            id: "docs",
            label: "Docs",
            status: "ready",
            summary: "Review docs before planning.",
            actionLabel: "open docs",
            screen: "docs",
            ids: { traceId: "trace-workflow", taskId: "task-docs" },
          },
          {
            id: "execution",
            label: "Execution",
            status: "in_progress",
            summary: "Open active agent run.",
            actionLabel: "open runs",
            screen: "runs",
            ids: { traceId: "trace-workflow", runId: "run-exec", taskId: "task-exec" },
          },
          {
            id: "review",
            label: "Review",
            status: "waiting",
            summary: "Inspect review handoff.",
            actionLabel: "open review",
            screen: "review",
            ids: { traceId: "trace-workflow", runId: "run-review", reviewId: "review-code" },
          },
        ],
      },
    });

    await screen.load();
    const output = renderPlain((renderer) => screen.render(renderer));

    expect(output).toContain("Plan Review Workflow");
    expect(output).toContain("project-workflow");
    expect(output).toContain("plan-agent-review");
    expect(output).toContain("trace-workflow");
    expect(output).toContain("run:run-exec");
    expect(output).toContain("task:task-exec");
    expect(output).toContain("review:review-code");
  });

  test("loads workflow state through caller and opens only available stages", async () => {
    const opened: string[] = [];
    const calls: unknown[] = [];
    const caller: PlanReviewScreenOptions["caller"] = {
      workflow: {
        getPlanReviewState: async (input) => {
          calls.push(input);
          return {
            projectId: "project-caller",
            planId: "plan-caller",
            traceId: "trace-caller",
            stages: [
              {
                id: "planning",
                label: "Planning",
                status: "ready",
                summary: "Planning ready.",
                actionLabel: "open planning",
                ids: { traceId: "trace-caller", runId: "run-planning", taskId: "task-planning" },
              },
              {
                id: "uat",
                label: "UAT",
                status: "unavailable",
                summary: "UAT waits on review.",
                actionLabel: "open UAT",
                ids: { traceId: "trace-caller", reviewId: "review-uat" },
                unavailableReason: "Review evidence has not passed.",
              },
            ],
          };
        },
      },
    };
    const screen = new PlanReviewScreen({
      projectId: "project-caller",
      planId: "plan-caller",
      traceId: "trace-caller",
      caller,
      onOpenStage: (stage) => opened.push(stage.id),
    });

    await screen.load();
    expect(calls[0]).toEqual({
      projectId: "project-caller",
      planId: "plan-caller",
      traceId: "trace-caller",
    });

    await screen.handleKey("\n");
    expect(opened).toEqual(["planning"]);

    await screen.handleKey("j");
    await screen.handleKey("\n");
    expect(opened).toEqual(["planning"]);

    const output = renderPlain((renderer) => screen.render(renderer));
    expect(output).toContain("Unavailable: Review evidence has not passed.");
    expect(output).toContain("review:review-uat");
  });
});
