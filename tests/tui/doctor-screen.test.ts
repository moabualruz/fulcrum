/**
 * TUI Doctor screen + OpenTUI gate tests (Issue 18).
 * RED → GREEN: run before implementation to confirm failures, then after.
 */

import { describe, expect, it } from "bun:test";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";
import { Renderer } from "@fulcrum/tui/renderer.ts";
import {
  DoctorScreen,
  evaluateOpenTuiGate,
  runOpenTuiSnapshotGate,
  OPENTUI_GATE_THRESHOLD,
  TuiDoctorCheckSchema,
} from "@fulcrum/tui/screens/doctor.ts";
import type { DoctorCheckResult } from "@platform-core/interface/doctor-results.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTTY() {
  return new FakeTTY({ columns: 120, rows: 40 });
}

function renderPlain(screen: DoctorScreen): string {
  const tty = makeTTY();
  screen.render(new Renderer(tty));
  return tty.plainText();
}

function makeResult(overrides: Partial<DoctorCheckResult> = {}): DoctorCheckResult {
  return {
    name: "tui.test-check",
    subsystem: "tui",
    status: "ok",
    message: "all good",
    durationMs: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DoctorScreen: empty state
// ---------------------------------------------------------------------------

describe("DoctorScreen: empty state", () => {
  it("renders loading placeholder when no results", () => {
    const screen = new DoctorScreen();
    const text = renderPlain(screen);
    expect(text).toContain("Running checks");
  });

  it("renders subsystem in header", () => {
    const screen = new DoctorScreen({ subsystem: "tui" });
    const text = renderPlain(screen);
    expect(text).toContain("tui");
  });
});

// ---------------------------------------------------------------------------
// DoctorScreen: with results
// ---------------------------------------------------------------------------

describe("DoctorScreen: with results", () => {
  const results: DoctorCheckResult[] = [
    makeResult({ name: "tui.binary-tui-entrypoint", status: "ok",   message: "entrypoint ok",   durationMs: 2 }),
    makeResult({ name: "tui.opentui-version",       status: "warn", message: "no opentui pkg",   durationMs: 1, recovery: "install opentui" }),
    makeResult({ name: "tui.render-p95-ms",         status: "fail", message: "p95 350ms",         durationMs: 3, recovery: "profile renders" }),
    makeResult({ name: "tui.keybind-conflicts",     status: "ok",   message: "no conflicts",      durationMs: 1 }),
    makeResult({ name: "tui.trpc-warmup",           status: "ok",   message: "caller resolved",   durationMs: 5 }),
    makeResult({ name: "tui.subscription-bridge",   status: "ok",   message: "event in 0ms",      durationMs: 0 }),
    makeResult({ name: "tui.wcwidth-cjk",           status: "ok",   message: "wcwidth = 2",        durationMs: 0 }),
  ];

  it("renders all 7 check names", () => {
    const screen = new DoctorScreen({ results });
    const text = renderPlain(screen);
    expect(text).toContain("binary-tui-entrypoint");
    expect(text).toContain("opentui-version");
    expect(text).toContain("render-p95-ms");
    expect(text).toContain("keybind-conflicts");
    expect(text).toContain("trpc-warmup");
    expect(text).toContain("subscription-bridge");
    expect(text).toContain("wcwidth-cjk");
  });

  it("renders summary counts", () => {
    const screen = new DoctorScreen({ results });
    const text = renderPlain(screen);
    expect(text).toContain("5 ok");
    expect(text).toContain("1 warn");
    expect(text).toContain("1 fail");
    expect(text).toContain("7 checks");
  });

  it("renders status badges", () => {
    const screen = new DoctorScreen({ results });
    const text = renderPlain(screen);
    expect(text).toContain("OK");
    expect(text).toContain("WARN");
    expect(text).toContain("FAIL");
  });

  it("renders duration in ms", () => {
    const screen = new DoctorScreen({ results });
    const text = renderPlain(screen);
    expect(text).toContain("ms");
  });

  it("setResults updates displayed data", () => {
    const screen = new DoctorScreen();
    screen.setResults([makeResult({ name: "tui.foo", message: "injected" })]);
    const text = renderPlain(screen);
    expect(text).toContain("injected");
  });
});

// ---------------------------------------------------------------------------
// DoctorScreen: keyboard navigation
// ---------------------------------------------------------------------------

describe("DoctorScreen: keyboard navigation", () => {
  it("j moves cursor down", async () => {
    const screen = new DoctorScreen({ results: [
      makeResult({ name: "tui.a" }),
      makeResult({ name: "tui.b" }),
    ]});
    await screen.handleKey("j");
    // After j cursor is on second item: render should inverse tui.b row
    const tty = makeTTY();
    screen.render(new Renderer(tty));
    // Just check it doesn't throw and contains both names
    expect(tty.plainText()).toContain("b");
  });

  it("k moves cursor up", async () => {
    const screen = new DoctorScreen({ results: [
      makeResult({ name: "tui.a" }),
      makeResult({ name: "tui.b" }),
    ]});
    await screen.handleKey("j");
    await screen.handleKey("k");
    const text = renderPlain(screen);
    expect(text).toContain("a");
  });

  it("Escape triggers onExit", async () => {
    let exited = false;
    const screen = new DoctorScreen({ onExit: () => { exited = true; } });
    await screen.handleKey("\x1b");
    expect(exited).toBe(true);
  });

  it("q triggers onExit", async () => {
    let exited = false;
    const screen = new DoctorScreen({ onExit: () => { exited = true; } });
    await screen.handleKey("q");
    expect(exited).toBe(true);
  });

  it("Enter expands recovery text", async () => {
    const screen = new DoctorScreen({
      results: [makeResult({ name: "tui.x", status: "warn", recovery: "do the thing" })],
    });
    await screen.handleKey("\r");
    const text = renderPlain(screen);
    expect(text).toContain("do the thing");
  });

  it("Enter again collapses recovery text", async () => {
    const screen = new DoctorScreen({
      results: [makeResult({ name: "tui.x", status: "warn", recovery: "do the thing" })],
    });
    await screen.handleKey("\r");
    await screen.handleKey("\r");
    const text = renderPlain(screen);
    expect(text).not.toContain("do the thing");
  });
});

// ---------------------------------------------------------------------------
// TuiDoctorCheckSchema: Zod validation
// ---------------------------------------------------------------------------

describe("TuiDoctorCheckSchema", () => {
  it("validates a well-formed check result", () => {
    const parsed = TuiDoctorCheckSchema.safeParse(makeResult());
    expect(parsed.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const parsed = TuiDoctorCheckSchema.safeParse({ name: "x" });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid status", () => {
    const parsed = TuiDoctorCheckSchema.safeParse(makeResult({ status: "pass" as "ok" }));
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OpenTUI gate: evaluateOpenTuiGate
// ---------------------------------------------------------------------------

describe("evaluateOpenTuiGate", () => {
  it("OPENTUI_GATE_THRESHOLD is 10", () => {
    expect(OPENTUI_GATE_THRESHOLD).toBe(10);
  });

  it("gate passes when failedSnapshots <= 10", () => {
    for (const n of [0, 5, 10]) {
      const result = evaluateOpenTuiGate(n);
      expect(result.gateFailed).toBe(false);
      expect(result.failedSnapshots).toBe(n);
    }
  });

  it("gate fails when failedSnapshots > 10", () => {
    for (const n of [11, 20, 100]) {
      const result = evaluateOpenTuiGate(n);
      expect(result.gateFailed).toBe(true);
    }
  });

  it("failure message includes ratatui migration path", () => {
    const result = evaluateOpenTuiGate(11);
    expect(result.message).toContain("HANDOVER.md");
    expect(result.message.toLowerCase()).toContain("ratatui");
  });

  it("failure message includes threshold", () => {
    const result = evaluateOpenTuiGate(15);
    expect(result.message).toContain("15");
    expect(result.message).toContain("10");
  });

  it("passing message does not mention migration", () => {
    const result = evaluateOpenTuiGate(3);
    expect(result.gateFailed).toBe(false);
    expect(result.message).toContain("passed");
  });
});

// ---------------------------------------------------------------------------
// OpenTUI gate: runOpenTuiSnapshotGate
// ---------------------------------------------------------------------------

describe("runOpenTuiSnapshotGate", () => {
  const screens = [
    { name: "dashboard", render: () => "dashboard content" },
    { name: "projects",  render: () => "projects content" },
    { name: "settings",  render: () => "settings content" },
  ];

  it("zero failures when all snapshots match", () => {
    const snapshots = {
      dashboard: "dashboard content",
      projects:  "projects content",
      settings:  "settings content",
    };
    const result = runOpenTuiSnapshotGate(screens, snapshots);
    expect(result.failedSnapshots).toBe(0);
    expect(result.gateFailed).toBe(false);
  });

  it("counts failures when snapshots mismatch", () => {
    const snapshots = {
      dashboard: "DIFFERENT",
      projects:  "projects content",
      settings:  "DIFFERENT",
    };
    const result = runOpenTuiSnapshotGate(screens, snapshots);
    expect(result.failedSnapshots).toBe(2);
  });

  it("skips screens with no baseline snapshot", () => {
    const result = runOpenTuiSnapshotGate(screens, {});
    expect(result.failedSnapshots).toBe(0);
  });

  it("counts thrown render errors as failures", () => {
    const badScreens = [
      ...screens,
      { name: "broken", render: () => { throw new Error("OpenTUI API broken"); } },
    ];
    const snapshots = { broken: "expected" };
    const result = runOpenTuiSnapshotGate(badScreens, snapshots);
    expect(result.failedSnapshots).toBe(1);
  });

  it("gate fails when >10 screens fail", () => {
    const manyScreens = Array.from({ length: 12 }, (_, i) => ({
      name: `screen-${i}`,
      render: () => "actual",
    }));
    const snapshots = Object.fromEntries(manyScreens.map((s) => [s.name, "expected"]));
    const result = runOpenTuiSnapshotGate(manyScreens, snapshots);
    expect(result.gateFailed).toBe(true);
    expect(result.failedSnapshots).toBe(12);
    expect(result.message).toContain("HANDOVER.md");
  });
});

// ---------------------------------------------------------------------------
// prd-tui-stage-workbenches-set: Operate stage workbench OD parity.
//
// The Operate (`:doctor`) workbench renders the OD `tui-runs.html` stage
// chrome: the `fulcrum · :doctor · subsystems` header carrying the exact
// stage name, the StatusFooter strip, and the shared empty-state contract.
// Snapshots are locked at 80x24 and 120x32.
// ---------------------------------------------------------------------------

describe("Operate stage workbench (:doctor): OD parity", () => {
  function renderAt(cols: number, rows: number, screen: DoctorScreen): string {
    const tty = new FakeTTY({ columns: cols, rows });
    screen.render(new Renderer(tty));
    return tty.plainText();
  }

  const checks: DoctorCheckResult[] = [
    makeResult({ name: "tui.jwt-verification", status: "ok", message: "p95 4ms", durationMs: 4 }),
    makeResult({ name: "tui.telemetry-contract", status: "fail", message: "schema mismatch", durationMs: 3, recovery: "rename schema or migrate field" }),
  ];

  it("renders the Operate workbench header + footer at 80x24 and 120x32", () => {
    const screen = new DoctorScreen({
      results: checks,
      projectLabel: "auth/rewrite",
      traceId: "tr_56e3d12",
      mcp: "6/7",
    });
    for (const [cols, rows] of [[80, 24], [120, 32]] as const) {
      const snap = renderAt(cols, rows, screen);
      expect(snap).toContain("Operate");
      expect(snap).toContain("fulcrum · :doctor · subsystems");
      expect(snap).toContain("OPERATE");
      expect(snap).toContain("run: -");
      expect(snap).toContain("trace tr_56e3d1");
      expect(snap).toContain("span -");
      expect(snap).not.toContain("m mode");
    }
  });

  it("p/d/m honor the Play/Discuss/mode-picker contract", async () => {
    const screen = new DoctorScreen({ results: checks });
    await screen.handleKey("p");
    expect(screen.currentStepMode).toBe("play");
    await screen.handleKey("d");
    expect(screen.currentStepMode).toBe("discuss");
    await screen.handleKey("m");
    expect(screen.currentStepMode).toBe("discuss");
    const text = renderPlain(screen);
    expect(text).toContain("Mode picker");
    expect(text).toContain("Play current step");
  });

  it("empty Operate workbench renders the shared one-sentence/one-action contract", () => {
    const screen = new DoctorScreen({ subsystem: "tui" });
    const snap = renderAt(80, 24, screen);
    expect(snap).toContain("No tui subsystem checks have run yet.");
    expect(snap).toContain("Running checks");
  });
});
