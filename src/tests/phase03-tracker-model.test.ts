/**
 * Phase 03 integration tests — Tracker Model (SymphonyIssueSchema).
 *
 * Validates the strict 12-field issue model, blocked-by refs,
 * and orchestration state constraints.
 */

import { describe, expect, test } from "bun:test";
import {
  SymphonyIssueSchema,
  BlockedByRefSchema,
  AgentRunOrchestrationStateSchema,
  CandidateIssueSchema,
  WorkflowConfigSchema,
  READY_TASK_STATUS,
  type SymphonyIssue,
} from "../orchestration/symphony/schemas.ts";
import { TrackerBlockerResolutionError } from "../orchestration/symphony/tracker.ts";

const validUuid = "01234567-89ab-cdef-0123-456789abcdef";
const validUuid2 = "abcdefab-cdef-0123-4567-89abcdef0123";
const now = new Date();

function makeSymphonyIssue(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    id: validUuid,
    identifier: "TSK-42",
    title: "Implement feature X",
    description: "Details here",
    branch_name: "feat/x",
    url: "https://example.com/TSK-42",
    labels: ["Bug", "P1"],
    state: "in_progress",
    priority: 2,
    created_at: now,
    updated_at: now,
    blocked_by: [],
    ...overrides,
  };
}

describe("Phase 03: Tracker Model — SymphonyIssueSchema", () => {
  test("valid issue passes schema validation", () => {
    const result = SymphonyIssueSchema.safeParse(makeSymphonyIssue());
    expect(result.success).toBe(true);
  });

  test("labels are normalized to lowercase", () => {
    const result = SymphonyIssueSchema.parse(makeSymphonyIssue({ labels: ["BUG", "Feature"] }));
    expect(result.labels).toEqual(["bug", "feature"]);
  });

  test("rejects missing required field (identifier)", () => {
    const issue = makeSymphonyIssue();
    delete (issue as any).identifier;
    const result = SymphonyIssueSchema.safeParse(issue);
    expect(result.success).toBe(false);
  });

  test("rejects invalid UUID format for id", () => {
    const result = SymphonyIssueSchema.safeParse(makeSymphonyIssue({ id: "not-a-uuid" }));
    expect(result.success).toBe(false);
  });

  test("nullable fields accept null", () => {
    const result = SymphonyIssueSchema.safeParse(
      makeSymphonyIssue({ description: null, branch_name: null, url: null, priority: null }),
    );
    expect(result.success).toBe(true);
  });

  // --- BlockedByRef ---

  test("BlockedByRefSchema validates blocker references", () => {
    const ref = { id: validUuid, identifier: "TSK-1", state: "succeeded" };
    expect(BlockedByRefSchema.safeParse(ref).success).toBe(true);
  });

  test("BlockedByRefSchema rejects empty identifier", () => {
    const ref = { id: validUuid, identifier: "", state: "done" };
    expect(BlockedByRefSchema.safeParse(ref).success).toBe(false);
  });

  // --- Orchestration state enum ---

  test("AgentRunOrchestrationStateSchema validates known states", () => {
    expect(AgentRunOrchestrationStateSchema.safeParse("running").success).toBe(true);
    expect(AgentRunOrchestrationStateSchema.safeParse("bogus").success).toBe(false);
  });

  // --- TrackerBlockerResolutionError ---

  test("TrackerBlockerResolutionError carries taskId and unresolvedBlockerIds", () => {
    const err = new TrackerBlockerResolutionError("task-1", ["blocker-a", "blocker-b"]);
    expect(err.taskId).toBe("task-1");
    expect(err.unresolvedBlockerIds).toEqual(["blocker-a", "blocker-b"]);
    expect(err.message).toContain("blocker-a");
  });

  // --- CandidateIssueSchema per-state concurrency guard ---

  test("CandidateIssueSchema requires status = ready", () => {
    const candidate = {
      id: validUuid,
      identifier: "TSK-5",
      title: "Test",
      state: "open",
      status: READY_TASK_STATUS,
      priority: 1,
      createdAt: now,
      blockedByIds: [],
      workflowId: null,
    };
    expect(CandidateIssueSchema.safeParse(candidate).success).toBe(true);

    // non-ready status rejected
    const nonReady = { ...candidate, status: "in_progress" };
    expect(CandidateIssueSchema.safeParse(nonReady).success).toBe(false);
  });
});
