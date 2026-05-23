import { describe, expect, test } from "bun:test";

import {
  buildApprovedPlanSourceSnapshots,
  checkPlanExecutionStaleness,
} from "@planning-review/application/spec-staleness.ts";

describe("plan execution staleness", () => {
  test("detects changed linked docs and requires review refresh before execution", () => {
    const snapshots = buildApprovedPlanSourceSnapshots([
      {
        kind: "doc",
        id: "brief",
        label: "Requirements brief",
        content: "Use local-first execution.",
        versionId: "v1",
        updatedAt: "2026-05-18T01:00:00.000Z",
      },
      {
        kind: "artifact",
        id: "prototype",
        label: "Planning prototype",
        content: "<button>Approve plan</button>",
      },
    ]);

    const result = checkPlanExecutionStaleness({
      planId: "plan-1",
      approvedAt: "2026-05-18T01:05:00.000Z",
      snapshots,
      currentSources: [
        {
          kind: "doc",
          id: "brief",
          label: "Requirements brief",
          content: "Use local-first execution and show the trace.",
          versionId: "v2",
          updatedAt: "2026-05-18T01:30:00.000Z",
        },
        {
          kind: "artifact",
          id: "prototype",
          label: "Planning prototype",
          content: "<button>Approve plan</button>",
        },
      ],
    });

    expect(result.status).toBe("stale");
    expect(result.requiredAction).toBe("refresh_review");
    expect(result.changedSources).toEqual([
      expect.objectContaining({
        kind: "doc",
        id: "brief",
        label: "Requirements brief",
        previousVersionId: "v1",
        currentVersionId: "v2",
        requiredAction: "refresh_review",
        summary: "Requirements brief changed after plan approval.",
      }),
    ]);
    expect(result.changedSources[0]?.previousHash).not.toBe(result.changedSources[0]?.currentHash);
  });

  test("records explicit stale execution acceptance with reason", () => {
    const snapshots = buildApprovedPlanSourceSnapshots([
      {
        kind: "task_criteria",
        id: "criterion-1",
        label: "Acceptance criterion",
        content: "Run typecheck.",
      },
    ]);

    const result = checkPlanExecutionStaleness({
      planId: "plan-override",
      approvedAt: "2026-05-18T01:05:00.000Z",
      snapshots,
      currentSources: [
        {
          kind: "task_criteria",
          id: "criterion-1",
          label: "Acceptance criterion",
          content: "Run typecheck and lint.",
        },
      ],
      acceptStaleExecution: {
        acceptedBy: "user-1",
        reason: "Only tightened verification wording; implementation already covers both commands.",
        acceptedAt: "2026-05-18T01:40:00.000Z",
      },
    });

    expect(result.status).toBe("accepted_stale");
    expect(result.requiredAction).toBe("accepted_with_reason");
    expect(result.override).toEqual({
      acceptedBy: "user-1",
      reason: "Only tightened verification wording; implementation already covers both commands.",
      acceptedAt: "2026-05-18T01:40:00.000Z",
    });
    expect(result.changedSources[0]?.requiredAction).toBe("accepted_with_reason");
  });
});
