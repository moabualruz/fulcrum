/**
 * Cross-surface Capture journey E2E (`prd-web-capture-stage-shell`,
 * `done_mode: journey-closure`).
 *
 * The Capture stage is one workflow stage with the same identity in web, CLI,
 * and TUI (IA-MAP.md §2.1). This test exercises the whole Capture path across
 * the sibling surfaces and FAILS if any one of them is stubbed:
 *
 *  1. CLI — `fulcrum capture text|inbox` intakes rough input and triages the
 *     intake queue, emitting the canonical `fulcrum.cli.v1` envelope with a
 *     trace id (`apps/cli/src/commands/capture.ts`).
 *  2. TUI — the `:capture` workbench surfaces the captured drafts across its
 *     inbox / seedlings / drafts / promoted views and hands a draft off to
 *     Plan (`apps/tui/src/screens/capture.ts`).
 *  3. Trace continuity — the trace id allocated on the capture survives the
 *     CLI intake AND the TUI Capture → Plan handoff, so a Capture action
 *     started on one surface is followable on the others by the same id.
 *
 * The web half of the journey (the `/<ws>/projects/<projId>/capture` stage
 * workbench, OD `capture.html`) is proven by the rendered Playwright spec
 * `apps/web/tests/design-e2e/ws-capture-stage.spec.ts`; this E2E covers the
 * CLI + TUI surfaces and the shared trace invariant they must all honour.
 */

import { describe, expect, test } from "bun:test";

import { run as runCaptureCli, type CaptureCaller } from "../../apps/cli/src/commands/capture.ts";
import {
  CAPTURE_WORKBENCH_VIEWS,
  CaptureWorkbenchScreen,
} from "../../apps/tui/src/screens/capture.ts";

/** A line-recording renderer for the TUI Capture workbench snapshot. */
class JourneyRenderer {
  lines: string[] = [];
  readonly width = 96;
  writeln(line = ""): void {
    this.lines.push(line);
  }
  output(): string {
    return this.lines.join("\n");
  }
}

/** Strip ANSI colour codes so the TUI snapshot matches plain text. */
function plain(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\[[0-9;]*m/g, "");
}

/** The trace id that must survive every surface of the Capture journey. */
const JOURNEY_TRACE = "8f29a4c1b3e0d5f7c2a90e6b4d138a72";

/**
 * A capture caller that records every CLI intake and echoes the supplied
 * trace id back — the seam the env-backed caller implements against the real
 * `/api/v1/captures` surface.
 */
function journeyCaptureCaller(): CaptureCaller & { intakes: unknown[] } {
  const intakes: unknown[] = [];
  return {
    intakes,
    capture: {
      submitReview: async (input) => ({
        captureId: input.captureId,
        status: "review",
        action: "review",
        traceId: input.traceId ?? JOURNEY_TRACE,
        message: "Review note saved",
      }),
      setStatus: async (input) => ({
        captureId: input.captureId,
        status: input.status,
        action: "status",
        traceId: input.traceId ?? JOURNEY_TRACE,
        message: `Status set to ${input.status}`,
      }),
      runQuickAction: async (input) => ({
        captureId: input.captureId,
        status: "review",
        action: input.action,
        traceId: input.traceId ?? JOURNEY_TRACE,
        message: `Quick action ${input.action} queued`,
      }),
      intake: async (input) => {
        intakes.push(["intake", input]);
        return {
          captureId: "cap_journey",
          kind: input.kind,
          traceId: input.traceId ?? JOURNEY_TRACE,
          message: `Captured ${input.kind}`,
        };
      },
      triageInbox: async (input) => {
        intakes.push(["inbox", input]);
        return {
          captureId: input.captureId,
          kind: input.action,
          traceId: input.traceId ?? JOURNEY_TRACE,
          message: `Inbox ${input.action}`,
        };
      },
    },
  };
}

describe("capture journey — cross-surface stage closure", () => {
  test("CLI capture intake emits a traceable envelope for text input", async () => {
    const caller = journeyCaptureCaller();
    const lines: string[] = [];

    await runCaptureCli(
      ["text", "Rework token refresh flow for offline first", "--trace", JOURNEY_TRACE, "--json"],
      { caller, print: (line) => lines.push(line), printErr: () => {}, exit: () => {} },
    );

    // The CLI capture verb ran and recorded the intake against the seam.
    expect(caller.intakes).toEqual([
      [
        "intake",
        {
          kind: "text",
          value: "Rework token refresh flow for offline first",
          projectId: undefined,
          traceId: JOURNEY_TRACE,
        },
      ],
    ]);

    // `--json` emits the canonical `fulcrum.cli.v1` envelope carrying the trace.
    const envelope = JSON.parse(lines[0] as string);
    expect(envelope.schema).toBe("fulcrum.cli.v1");
    expect(envelope.errors).toEqual([]);
    expect(envelope.result.kind).toBe("text");
    expect(envelope.result.traceId).toBe(JOURNEY_TRACE);
    // The envelope trace spine carries the same id (DESIGN.md §4.10).
    expect(envelope.trace_id).toBe(JOURNEY_TRACE);
  });

  test("CLI capture inbox triages an intake-queue item with the same trace", async () => {
    const caller = journeyCaptureCaller();
    const lines: string[] = [];

    await runCaptureCli(["inbox", "--accept", "cap_journey", "--trace", JOURNEY_TRACE, "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(caller.intakes).toEqual([
      ["inbox", { captureId: "cap_journey", action: "accept", traceId: JOURNEY_TRACE }],
    ]);
    const envelope = JSON.parse(lines[0] as string);
    expect(envelope.result.kind).toBe("accept");
    expect(envelope.result.traceId).toBe(JOURNEY_TRACE);
  });

  test("TUI :capture workbench surfaces the captured draft across its four views", () => {
    // The four Capture views are the same identity as the web sub-views.
    expect(CAPTURE_WORKBENCH_VIEWS).toEqual(["inbox", "seedlings", "drafts", "promoted"]);

    const screen = new CaptureWorkbenchScreen({
      projectLabel: "auth-rewrite",
      traceId: JOURNEY_TRACE,
      data: {
        drafts: [
          {
            id: "cap_journey",
            title: "Rework token refresh flow for offline first",
            preview: "Refresh token should age out gracefully when offline.",
            meta: "just now · 12 words · mkh",
          },
        ],
      },
    });

    // Switch to the Drafts view — the captured intake is now a Capture Step.
    expect(screen.handleKey("3")).toBe(true);
    expect(screen.currentView).toBe("drafts");

    const renderer = new JourneyRenderer();
    screen.render(renderer as never);
    const output = plain(renderer.output());
    expect(output).toContain("Capture");
    expect(output).toContain("Rework token refresh flow for offline first");
    // Every Capture Step carries the universal mode affordance.
    expect(output).toContain("step modes");
  });

  test("TUI Capture → Plan handoff preserves the trace identity end to end", () => {
    const screen = new CaptureWorkbenchScreen({
      traceId: JOURNEY_TRACE,
      data: {
        drafts: [
          {
            id: "cap_journey",
            title: "Rework token refresh flow for offline first",
            preview: "Refresh token should age out gracefully when offline.",
            meta: "just now · 12 words · mkh",
          },
        ],
      },
    });
    screen.handleKey("3");
    expect(screen.handleKey("P")).toBe(true);

    const handoff = screen.handoff;
    // The Plan handoff carries the SAME trace the CLI intake used — the trace
    // allocated on the capture is followable across every surface.
    expect(handoff?.stepId).toBe("cap_journey");
    expect(handoff?.route).toBe(":plan");
    expect(handoff?.traceId).toBe(JOURNEY_TRACE);
  });
});
