import { describe, expect, test } from "bun:test";

import {
  applyQuickAction,
  captureSummary,
  setCaptureStatus,
  submitReviewNote,
  type CaptureReviewState,
} from "./capture.ts";

function freshState(): CaptureReviewState {
  return {
    captureId: "cap-123",
    status: "triage",
    note: "",
    assignee: null,
    history: [],
  };
}

const FIXED_NOW = () => new Date("2026-05-19T01:00:00Z");

describe("capture review actions", () => {
  test("submitReviewNote stores the trimmed note and a history entry", () => {
    const next = submitReviewNote(freshState(), "  Looks legit  ", { now: FIXED_NOW });
    expect(next.note).toBe("Looks legit");
    expect(next.history).toHaveLength(1);
    expect(next.history[0]?.kind).toBe("note");
  });

  test("setCaptureStatus only writes history when the status changes", () => {
    const state = freshState();
    const same = setCaptureStatus(state, "triage", { now: FIXED_NOW });
    expect(same).toBe(state);
    const next = setCaptureStatus(state, "in_review", { now: FIXED_NOW });
    expect(next.status).toBe("in_review");
    expect(next.history).toHaveLength(1);
  });

  test("quick actions toggle assignee or status with history entries", () => {
    const state = freshState();
    const assigned = applyQuickAction(state, "assign", { assignee: "maya" }, { now: FIXED_NOW });
    expect(assigned.assignee).toBe("maya");
    expect(assigned.history[0]?.payload).toBe("assign:maya");

    const blocked = applyQuickAction(assigned, "block", {}, { now: FIXED_NOW });
    expect(blocked.status).toBe("blocked");

    const approved = applyQuickAction(state, "approve", {}, { now: FIXED_NOW });
    expect(approved.status).toBe("approved");

    const escalated = applyQuickAction(state, "escalate", {}, { now: FIXED_NOW });
    expect(escalated.status).toBe("escalated");
  });

  test("captureSummary surfaces id, status, and assignee", () => {
    const state = freshState();
    expect(captureSummary(state)).toBe("cap-123 • triage • unassigned");
    const assigned = applyQuickAction(state, "assign", { assignee: "maya" }, { now: FIXED_NOW });
    expect(captureSummary(assigned)).toBe("cap-123 • triage • maya");
  });
});
