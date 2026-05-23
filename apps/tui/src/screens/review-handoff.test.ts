import { describe, expect, test } from "bun:test";

import { Renderer } from "../renderer.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import { ReviewHandoffScreen, type ReviewHandoffScreenOptions } from "./review-handoff.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 140, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

function fakeCaller(): ReviewHandoffScreenOptions["caller"] & { calls: Array<{ procedure: string; input: unknown }> } {
  const calls: Array<{ procedure: string; input: unknown }> = [];
  return {
    calls,
    reports: {
      uatCodeReviewHandoff: async (input) => {
        calls.push({ procedure: "reports.uatCodeReviewHandoff", input });
        return {
          projectId: input.projectId,
          traceId: input.traceId,
          status: "ready",
          finalQaStatus: "passed",
          nextAction: "prompt_user_for_uat_code_review",
          promptMarkdown: "# UAT And Code Review Handoff\nReview QA evidence and generated E2E coverage before approval.",
          reviewSessions: [
            { id: "session-uat", type: "uat", status: "pending_user_decision" },
            { id: "session-code", type: "code_review", status: "pending_user_decision" },
          ],
          decisionOptions: [{ id: "approve_without_manual_review" }, { id: "request_changes" }],
        };
      },
      recordUatCodeReviewDecision: async (input) => {
        calls.push({ procedure: "reports.recordUatCodeReviewDecision", input });
        return {
          projectId: input.projectId,
          traceId: input.traceId,
          decision: input.decision,
          reviewType: input.reviewType,
          status: input.decision === "request_changes" ? "changes_requested" : "approved",
          nextAction: "real_data_e2e_generated",
          generatedE2eTests: [{
            filename: "trace-review-approval.spec.ts",
            runner: input.e2eRunner,
            bodyPath: "/tmp/fulcrum-artifacts/project/trace-review-approval.spec.ts",
            coverageCases: [{ criterion: "TUI can trace approval to executable E2E coverage." }],
          }],
        };
      },
      runGeneratedE2eRegressionTests: async (input) => {
        calls.push({ procedure: "reports.runGeneratedE2eRegressionTests", input });
        return {
          projectId: input.projectId,
          traceId: input.traceId,
          runner: input.runner,
          status: "planned",
          command: ["bun", "run", "web:e2e:generated"],
          cwd: "apps/web",
          testFiles: ["/tmp/fulcrum-artifacts/project/trace-review-approval.spec.ts"],
          artifactIds: ["artifact-generated-e2e"],
        };
      },
    },
  };
}

describe("ReviewHandoffScreen", () => {
  test("renders final-gate prompt, trace, review sessions, decision controls, and generated E2E affordance", async () => {
    const caller = fakeCaller();
    const screen = new ReviewHandoffScreen({
      projectId: "project-review",
      traceId: "trace-review",
      caller,
    });

    await screen.load();
    const output = renderPlain((renderer) => screen.render(renderer));

    expect(caller.calls[0]).toEqual({
      procedure: "reports.uatCodeReviewHandoff",
      input: { projectId: "project-review", traceId: "trace-review" },
    });
    expect(output).toContain("UAT and Code Review Handoff");
    expect(output).toContain("trace-review");
    expect(output).toContain("Final gate prompt");
    expect(output).toContain("Review QA evidence");
    expect(output).toContain("session-uat");
    expect(output).toContain("session-code");
    expect(output).toContain("A approve without manual review");
    expect(output).toContain("X request changes");
    expect(output).toContain("E plan generated E2E");
  });

  test("approve, request changes, and E2E planning call reports surface with trace linkage", async () => {
    const caller = fakeCaller();
    const screen = new ReviewHandoffScreen({
      projectId: "project-review",
      traceId: "trace-review",
      caller,
    });

    await screen.load();
    await screen.handleKey("A");
    expect(caller.calls.at(-1)).toEqual({
      procedure: "reports.recordUatCodeReviewDecision",
      input: {
        projectId: "project-review",
        traceId: "trace-review",
        decision: "approve_without_manual_review",
        reviewType: "uat",
        feedback: "Approved from TUI final gate.",
        e2eRunner: "playwright",
      },
    });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("TUI can trace approval to executable E2E coverage.");

    await screen.handleKey("X");
    expect(caller.calls.at(-1)).toMatchObject({
      procedure: "reports.recordUatCodeReviewDecision",
      input: {
        projectId: "project-review",
        traceId: "trace-review",
        decision: "request_changes",
        reviewType: "code_review",
      },
    });

    await screen.handleKey("E");
    expect(caller.calls.at(-1)).toEqual({
      procedure: "reports.runGeneratedE2eRegressionTests",
      input: {
        projectId: "project-review",
        traceId: "trace-review",
        runner: "playwright",
        planOnly: true,
      },
    });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("bun run web:e2e:generated");
  });
});
