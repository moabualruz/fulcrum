import { describe, expect, test } from "bun:test";

import {
  applyQuickAction,
  captureSummary,
  CAPTURE_WORKBENCH_VIEWS,
  CaptureWorkbenchScreen,
  setCaptureStatus,
  submitReviewNote,
  type CaptureReviewState,
  type CaptureWorkbenchStep,
} from "./capture.ts";

/** A minimal renderer that records every written line for snapshot assertions. */
class TestRenderer {
  lines: string[] = [];
  readonly width = 96;
  writeln(line = ""): void {
    this.lines.push(line);
  }
  output(): string {
    return this.lines.join("\n");
  }
}

/** Strip ANSI colour codes so snapshot assertions match plain text. */
function plain(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\[[0-9;]*m/g, "");
}

function draftStep(id: string, title: string): CaptureWorkbenchStep {
  return { id, title, preview: `${title} preview`, meta: "3d · 412 words · mkh" };
}

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

describe(":capture workbench screen", () => {
  test("exposes the four Capture views: inbox, seedlings, drafts, promoted", () => {
    expect(CAPTURE_WORKBENCH_VIEWS).toEqual(["inbox", "seedlings", "drafts", "promoted"]);
  });

  test("renders the Capture header, the view switcher, and the CAPTURE footer", () => {
    const screen = new CaptureWorkbenchScreen({
      projectLabel: "auth-rewrite",
      traceId: "8f29a4c1b3e0d5f7c2a90e6b4d138a72",
      mcp: "7/7",
    });
    const renderer = new TestRenderer();
    screen.render(renderer as never);
    const output = plain(renderer.output());

    expect(output).toContain("Capture");
    expect(output).toContain("fulcrum · :capture");
    // The four-view switcher renders all of inbox/seedlings/drafts/promoted.
    expect(output).toContain("1 inbox");
    expect(output).toContain("2 seedlings");
    expect(output).toContain("3 drafts");
    expect(output).toContain("4 promoted");
    // The StatusFooter MODE pill is CAPTURE and the trace segment is present.
    expect(output).toContain("CAPTURE");
    expect(output).toContain("trace 8f29a4c1b…");
  });

  test("renders the one-sentence + one-action empty state for an empty view", () => {
    const screen = new CaptureWorkbenchScreen({});
    const renderer = new TestRenderer();
    screen.render(renderer as never);
    const output = plain(renderer.output());
    expect(output).toContain("Inbox is clear");
    expect(output).toContain("Press c to capture.");
  });

  test("1/2/3/4 switch views and the drafts view renders Step rows + mode affordances", () => {
    const screen = new CaptureWorkbenchScreen({
      data: {
        drafts: [draftStep("cap_a", "Rework token refresh"), draftStep("cap_b", "k9s status spine")],
      },
    });
    expect(screen.handleKey("3")).toBe(true);
    expect(screen.currentView).toBe("drafts");

    const renderer = new TestRenderer();
    screen.render(renderer as never);
    const output = plain(renderer.output());
    expect(output).toContain("Rework token refresh");
    expect(output).toContain("k9s status spine");
    // Every Capture Step row carries the universal mode affordance.
    expect(output).toContain("step modes");
    expect(output).toContain("Manual");
    expect(output).toContain("AI Assist");
  });

  test("j/k move the Step cursor within the active view", () => {
    const screen = new CaptureWorkbenchScreen({
      data: { inbox: [draftStep("cap_a", "first"), draftStep("cap_b", "second")] },
    });
    expect(screen.focusedStep?.id).toBe("cap_a");
    screen.handleKey("j");
    expect(screen.focusedStep?.id).toBe("cap_b");
    screen.handleKey("k");
    expect(screen.focusedStep?.id).toBe("cap_a");
  });

  test("P hands the focused capture off to Plan, preserving the trace identity", () => {
    const screen = new CaptureWorkbenchScreen({
      traceId: "8f29a4c1b3e0d5f7c2a90e6b4d138a72",
      data: { drafts: [draftStep("cap_a", "Rework token refresh")] },
    });
    screen.handleKey("3");
    expect(screen.handleKey("P")).toBe(true);

    const handoff = screen.handoff;
    expect(handoff?.stepId).toBe("cap_a");
    expect(handoff?.route).toBe(":plan");
    // The trace allocated on the capture survives into the planning session.
    expect(handoff?.traceId).toBe("8f29a4c1b3e0d5f7c2a90e6b4d138a72");
  });

  test("the m chord arms before a Step action key is handled", () => {
    const screen = new CaptureWorkbenchScreen({
      data: { inbox: [draftStep("cap_a", "first")] },
    });
    // Bare `m` arms the mode chord and is consumed.
    expect(screen.handleKey("m")).toBe(true);
    // The next key selects a mode and is consumed by the chord, not the screen.
    expect(screen.handleKey("p")).toBe(true);
  });
});
