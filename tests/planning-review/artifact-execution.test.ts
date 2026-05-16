import { describe, expect, test } from "bun:test";

import {
  buildPlanningArtifactExecutionRecord,
  mergePlanningArtifactExecutionMetadata,
} from "@planning-review/application/artifact-execution.ts";
import { buildPlanningArtifactRunId } from "@workflow-coordination/application/planning-preview.service.ts";

describe("planning artifact execution records", () => {
  test("normalizes execution results into persisted prototype metadata", () => {
    const record = buildPlanningArtifactExecutionRecord({
      planId: "plan-build-plan",
      artifactPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
      status: "passed",
      prototypeId: "prototype-plan-build-plan-1",
      artifactId: "artifact-plan-build-plan-1",
      traceId: "trace-build-plan",
      command: "bun",
      args: ["run", "--cwd", "apps/web", "test"],
      urlPath: "/planning",
      summary: "Preview route opened and review checks passed.",
      outputRef: "artifacts/planning-preview.txt",
      checks: ["route visible", "trace id visible"],
      executedAt: "2026-05-15T12:00:00.000Z",
    });

    expect(record).toEqual({
      planId: "plan-build-plan",
      artifactPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
      status: "passed",
      prototypeStatus: "validated",
      prototypeId: "prototype-plan-build-plan-1",
      artifactId: "artifact-plan-build-plan-1",
      traceId: "trace-build-plan",
      command: "bun",
      args: ["run", "--cwd", "apps/web", "test"],
      urlPath: "/planning",
      summary: "Preview route opened and review checks passed.",
      outputRef: "artifacts/planning-preview.txt",
      checks: ["route visible", "trace id visible"],
      executedAt: "2026-05-15T12:00:00.000Z",
    });

    expect(mergePlanningArtifactExecutionMetadata({
      eventId: "event-plan-build-plan-technical-planning-generated",
      preview: { id: "prototype-apps-web-src-routes-planning-workbench-prototype-tsx" },
      executions: [{ status: "ready" }],
    }, record)).toEqual({
      eventId: "event-plan-build-plan-technical-planning-generated",
      preview: { id: "prototype-apps-web-src-routes-planning-workbench-prototype-tsx" },
      execution: record,
      executions: [{ status: "ready" }, record],
    });
  });

  test("rejects incomplete execution records before persistence", () => {
    expect(() => buildPlanningArtifactExecutionRecord({
      planId: "",
      artifactPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
      status: "ready",
    })).toThrow("planId is required.");

    expect(() => buildPlanningArtifactExecutionRecord({
      planId: "plan-build-plan",
      artifactPath: "",
      status: "ready",
    })).toThrow("artifactPath is required.");
  });

  test("keeps artifact run ids unique for long paths", () => {
    const longPath = [
      "apps/web/src/routes/projects",
      "very-long-feature-name-that-would-otherwise-truncate-the-unique-run-suffix",
      "nested-workflow-review-panel-with-a-long-generated-artifact-name",
      "workbench-prototype.tsx",
    ].join("/");

    const first = buildPlanningArtifactRunId({
      planId: "plan-build-plan-with-a-long-readable-human-title",
      artifactPath: longPath,
      now: new Date("2026-05-15T12:00:00.000Z"),
      nonce: "first-run",
    });
    const second = buildPlanningArtifactRunId({
      planId: "plan-build-plan-with-a-long-readable-human-title",
      artifactPath: longPath,
      now: new Date("2026-05-15T12:00:00.000Z"),
      nonce: "second-run",
    });

    expect(first).toStartWith("artifact-run-1778846400000-first-run");
    expect(second).toStartWith("artifact-run-1778846400000-second-run");
    expect(first.length).toBeLessThanOrEqual(128);
    expect(second.length).toBeLessThanOrEqual(128);
    expect(first).not.toBe(second);
  });
});
