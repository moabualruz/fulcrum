import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import { Renderer } from "@fulcrum/tui/renderer.ts";
import { ArtifactsScreen } from "@fulcrum/tui/screens/artifacts.ts";
import { RunDetailScreen, RunsScreen } from "@fulcrum/tui/screens/runs.ts";
import {
  RunsControlScreen,
  STATUS_BADGE_STATES,
  statusBadgeLabel,
  statusBadgeText,
} from "@fulcrum/tui/screens/runs-screen.ts";
import { SubscriptionBridge } from "@fulcrum/tui/subscriptions.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 120, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

/** Render a screen at an exact terminal geometry: for stage-workbench snapshots. */
function renderAt(
  cols: number,
  rows: number,
  render: (renderer: Renderer) => void,
): string {
  const tty = new FakeTTY({ columns: cols, rows });
  render(new Renderer(tty));
  return tty.plainText();
}

describe("RunsScreen", () => {
  test("renders status badges, opens dispatch overlay, dispatches run, and opens detail", async () => {
    const created: unknown[] = [];
    const opened: string[] = [];
    const screen = new RunsScreen({
      caller: {
        agent_runs: {
          list: async () => [
            { id: "run-1", agent: "codex", status: "running", taskTitle: "Ship TUI", projectName: "Fulcrum" },
            { id: "run-2", agent: "claude", status: "completed", taskTitle: "Review plan", projectName: "Fulcrum" },
            { id: "run-3", agent: "gemini", status: "failed", taskTitle: "Summarize docs", projectName: "Docs" },
            { id: "run-4", agent: "codex", status: "cancelled", taskTitle: "Aborted run", projectName: "Fulcrum" },
          ],
          create: async (input) => {
            created.push(input);
            return { id: "run-new", agent: "codex", status: "running", taskTitle: "New task", projectName: "Fulcrum" };
          },
        },
      },
      onOpenRun: (id) => opened.push(id),
      viewportRows: 10,
    });

    await screen.load();
    const listing = renderPlain((renderer) => screen.render(renderer));
    // Canonical 8-state vocabulary (CLI-TUI-UX.md §11): glyph + exact label,
    // never the legacy `[running]` ad hoc bracket labels.
    for (const badge of ["● RUNNING", "✓ COMPLETE", "✗ FAILED", "⊘ CANCELLED"]) {
      expect(listing).toContain(badge);
    }
    expect(listing).not.toContain("[running]");
    expect(listing).not.toContain("[completed]");

    await screen.handleKey("d");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Dispatch run");

    await screen.submitDispatch({ projectId: "project-1", taskId: "task-1", agent: "codex" });
    expect(created).toEqual([{ projectId: "project-1", taskId: "task-1", agent: "codex" }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("run-new");

    await screen.handleKey("\r");
    expect(opened).toEqual(["run-new"]);
  });

  test("empty RunsScreen renders the shared one-sentence/one-action empty state", async () => {
    const screen = new RunsScreen({
      caller: {
        agent_runs: {
          list: async () => [],
          create: async () => ({ id: "x", agent: "codex", status: "running" }),
        },
      },
    });
    await screen.load();
    const snap = renderPlain((renderer) => screen.render(renderer));
    // Empty contract: one sentence naming the surface + one action hint.
    expect(snap).toContain("No runs yet in this project.");
    expect(snap).toContain("Press d to dispatch the first run.");
    expect(snap).not.toContain("No runs.");
  });

  test("failed RunsScreen renders the error frame carrying trace=<id>", async () => {
    const screen = new RunsScreen({
      traceId: "tr_9c1e3a5b",
      caller: {
        agent_runs: {
          list: async () => {
            throw new Error("runs service unreachable");
          },
          create: async () => ({ id: "x", agent: "codex", status: "running" }),
        },
      },
    });
    await screen.load();
    const snap = renderPlain((renderer) => screen.render(renderer));
    // Error frame: [what failed]. [why]. [next step]. trace=<id> (COPY.md §3).
    expect(snap).toContain("Runs feed failed to load.");
    expect(snap).toContain("runs service unreachable");
    expect(snap).toContain("trace=tr_9c1e3a5b");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// prd-tui-status-empty-error-contract: the shared 8-state status vocabulary.
//
// CLI-TUI-UX.md §11 / DESIGN.md §4.9 lock one universal status vocabulary:
// 8 states, glyph + UPPERCASE label, never colour-only. These tests assert the
// EXACT label and glyph for every state: not substring presence.
// ───────────────────────────────────────────────────────────────────────────

describe("Shared TUI status badge vocabulary (CLI-TUI-UX.md §11)", () => {
  test("renders all 8 canonical states with exact glyph + label", () => {
    const expected: Record<string, string> = {
      pending: "◌ PENDING",
      running: "● RUNNING",
      complete: "✓ COMPLETE",
      blocked: "⏸ BLOCKED",
      awaiting: "⌛ AWAITING",
      failed: "✗ FAILED",
      cancelled: "⊘ CANCELLED",
      degraded: "⚠ DEGRADED",
    };
    // The module exposes exactly the 8 states, in CLI-TUI-UX.md §11 order.
    expect([...STATUS_BADGE_STATES]).toEqual([
      "pending",
      "running",
      "complete",
      "blocked",
      "awaiting",
      "failed",
      "cancelled",
      "degraded",
    ]);
    for (const state of STATUS_BADGE_STATES) {
      expect(statusBadgeText(state)).toBe(expected[state] ?? "");
    }
  });

  test("labels are exactly the uppercase canonical strings", () => {
    expect(STATUS_BADGE_STATES.map((s) => statusBadgeLabel(s))).toEqual([
      "PENDING",
      "RUNNING",
      "COMPLETE",
      "BLOCKED",
      "AWAITING",
      "FAILED",
      "CANCELLED",
      "DEGRADED",
    ]);
  });

  test("raw service status strings fold onto the 8 canonical states", () => {
    // `complete` vs `completed` drift is gone: both resolve to COMPLETE.
    expect(statusBadgeLabel("completed")).toBe("COMPLETE");
    expect(statusBadgeLabel("complete")).toBe("COMPLETE");
    expect(statusBadgeLabel("succeeded")).toBe("COMPLETE");
    expect(statusBadgeLabel("ok")).toBe("COMPLETE");
    expect(statusBadgeLabel("passed")).toBe("COMPLETE");
    expect(statusBadgeLabel("in_progress")).toBe("RUNNING");
    expect(statusBadgeLabel("error")).toBe("FAILED");
    expect(statusBadgeLabel("changes_requested")).toBe("BLOCKED");
    expect(statusBadgeLabel("awaiting_review")).toBe("AWAITING");
    expect(statusBadgeLabel("archived")).toBe("CANCELLED");
  });
});

describe("RunDetailScreen", () => {
  test("appends live log lines within subscription, cancels run, shows completion banner, and unsubscribes on dispose", async () => {
    const bus = new EventEmitter();
    const cancelled: string[] = [];
    const screen = new RunDetailScreen({
      runId: "run-1",
      caller: {
        agent_runs: {
          get: async () => ({
            id: "run-1",
            agent: "codex",
            status: "running",
            taskTitle: "Ship TUI",
            projectName: "Fulcrum",
            logLines: ["boot"],
          }),
          cancel: async (input) => {
            cancelled.push(input.id);
            return { ok: true };
          },
        },
      },
      subscriptions: new SubscriptionBridge(bus),
    });

    await screen.load();
    bus.emit("runs.onRunUpdate", { id: "run-1", status: "running", logLine: "graphile-worker: started job" });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("graphile-worker: started job");

    await screen.handleKey("x");
    expect(cancelled).toEqual(["run-1"]);

    bus.emit("runs.onRunUpdate", { id: "run-1", status: "completed", logLine: "done" });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Run completed");

    screen.dispose();
    bus.emit("runs.onRunUpdate", { id: "run-1", status: "completed", logLine: "after dispose" });
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("after dispose");
  });

  test("dock tabs switch panes and footer carries run trace span identity", async () => {
    const screen = new RunDetailScreen({
      runId: "run-42",
      traceId: "tr_8f29a4c1b3e0",
      spanId: "span_0011223344",
      caller: {
        agent_runs: {
          get: async () => ({
            id: "run-42",
            agent: "codex",
            status: "running",
            taskTitle: "Recover TUI dock",
            projectName: "Fulcrum",
            logLines: ["booted"],
            traceId: "tr_8f29a4c1b3e0",
            spanId: "span_0011223344",
            observability: {
              artifacts: [{ filename: "patch.diff", lifecycleState: "ready" }],
              followUpTasks: [{ title: "verify footer identity" }],
            },
          }),
          cancel: async () => ({ ok: true }),
        },
      },
    });
    await screen.load();

    let text = renderPlain((renderer) => screen.render(renderer));
    expect(text).toContain("Shell dock");
    expect(text).toContain("run: run-42");
    expect(text).toContain("trace:8f29a4c1");
    expect(text).toContain("span_0011223344");

    await screen.handleKey("f");
    text = renderPlain((renderer) => screen.render(renderer));
    expect(text).toContain("Files dock");
    expect(text).toContain("patch.diff");

    await screen.handleKey("p");
    text = renderPlain((renderer) => screen.render(renderer));
    expect(text).toContain("Plan dock");
    expect(text).toContain("verify footer identity");

    await screen.handleKey("c");
    text = renderPlain((renderer) => screen.render(renderer));
    expect(text).toContain("Cost dock");
    expect(text).toContain("agent:codex");
  });
});

describe("ArtifactsScreen", () => {
  test("renders artifacts, previews first fifty text lines, uploads, downloads, archives, deletes, and filters", async () => {
    const uploads: unknown[] = [];
    const downloads: unknown[] = [];
    const archived: string[] = [];
    const deleted: string[] = [];
    const content = Array.from({ length: 55 }, (_, index) => `line ${index + 1}`).join("\n");
    const screen = new ArtifactsScreen({
      caller: {
        artifacts: {
          list: async () => [
            {
              id: "artifact-1",
              runId: "run-1",
              taskId: "task-1",
              filename: "run.txt",
              mime: "text/plain",
              path: "logs/run.txt",
              sizeBytes: "2048",
              createdAt: "2026-05-03T10:00:00Z",
            },
            {
              id: "artifact-2",
              filename: "trace.bin",
              mime: "application/octet-stream",
              path: "bins/trace.bin",
              sizeBytes: "16",
              createdAt: "2026-05-03T10:01:00Z",
            },
          ],
          get: async (input) => input.id === "artifact-1"
            ? {
              kind: "text",
              artifact: {
                id: "artifact-1",
                filename: "run.txt",
                mime: "text/plain",
                path: "logs/run.txt",
              },
              language: "text",
              content,
              truncated: false,
            }
            : {
              kind: "binary",
              artifact: {
                id: "artifact-2",
                filename: "trace.bin",
                mime: "application/octet-stream",
                path: "bins/trace.bin",
              },
              hexHeader: "00010203",
              bytesShown: 4,
            },
          upload: async (input) => {
            uploads.push(input);
            return { id: "artifact-3", filename: "new.log", mime: "text/plain", path: "new.log", sizeBytes: "7" };
          },
          download: async (input) => {
            downloads.push(input);
            return { ok: true, path: "/home/mkh/Downloads/run.txt" };
          },
          archive: async (input) => {
            archived.push(input.id);
            return { ok: true, id: input.id };
          },
          delete: async (input) => {
            deleted.push(input.id);
            return { ok: true, id: input.id };
          },
        },
      },
      homeDir: "/home/mkh",
    });

    await screen.load();
    const listing = renderPlain((renderer) => screen.render(renderer));
    expect(listing).toContain("run.txt");
    expect(listing).toContain("[text/plain]");
    expect(listing).toContain("task:task-1");
    expect(listing).toContain("line 1");
    expect(listing).toContain("line 50");
    expect(listing).not.toContain("line 51");

    await screen.handleKey("u");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Upload artifact");
    await screen.submitUploadPath("/tmp/new.log");
    expect(uploads).toEqual([{ path: "/tmp/new.log" }]);

    await screen.handleKey("d");
    expect(downloads).toEqual([{ id: "artifact-1", outPath: "/home/mkh/Downloads/run.txt" }]);

    await screen.handleKey("a");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Archive run.txt?");
    await screen.handleKey("y");
    expect(archived).toEqual(["artifact-1"]);

    await screen.handleKey("D");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Delete run.txt?");
    await screen.handleKey("y");
    expect(deleted).toEqual(["artifact-1"]);
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("logs/run.txt");

    await screen.handleKey("f");
    await screen.submitFilters({ mime: "application/octet-stream" });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("trace.bin");
  });

  test("multi-select with Space, bulk archive, and bulk delete", async () => {
    const archived: string[] = [];
    const deleted: string[] = [];
    const screen = new ArtifactsScreen({
      caller: {
        artifacts: {
          list: async () => [
            { id: "a1", filename: "one.txt", mime: "text/plain", path: "one.txt", sizeBytes: "10" },
            { id: "a2", filename: "two.txt", mime: "text/plain", path: "two.txt", sizeBytes: "20" },
            { id: "a3", filename: "three.txt", mime: "text/plain", path: "three.txt", sizeBytes: "30" },
          ],
          get: async () => null,
          upload: async () => ({ id: "x", filename: "x", mime: "text/plain", path: "x", sizeBytes: "0" }),
          download: async () => ({ ok: true, path: "/tmp/x" }),
          archive: async (input) => {
            archived.push(input.id);
            return { ok: true, id: input.id };
          },
          delete: async (input) => {
            deleted.push(input.id);
            return { ok: true, id: input.id };
          },
        },
      },
    });

    await screen.load();

    // Select first two with Space
    await screen.handleKey(" "); // select a1 (cursor at 0)
    await screen.handleKey("j"); // move to a2
    await screen.handleKey(" "); // select a2

    // Verify selection markers
    const listing = renderPlain((renderer) => screen.render(renderer));
    expect(listing).toContain("[x]");

    // Bulk archive
    await screen.handleKey("a");
    const archiveOverlay = renderPlain((renderer) => screen.render(renderer));
    expect(archiveOverlay).toContain("Archive 2 artifacts?");
    expect(archiveOverlay).toContain("one.txt");
    expect(archiveOverlay).toContain("two.txt");
    await screen.handleKey("y");
    expect(archived).toEqual(["a1", "a2"]);

    // Re-select for bulk delete
    await screen.handleKey("k"); // back to a1
    await screen.handleKey(" "); // select a1
    await screen.handleKey("j"); // to a2
    await screen.handleKey(" "); // select a2
    await screen.handleKey("j"); // to a3
    await screen.handleKey(" "); // select a3

    await screen.handleKey("D");
    const deleteOverlay = renderPlain((renderer) => screen.render(renderer));
    expect(deleteOverlay).toContain("Delete 3 artifacts?");
    await screen.handleKey("y");
    expect(deleted).toEqual(["a1", "a2", "a3"]);

    // All removed from list
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("No artifacts");
  });

  test("supports per-run and per-task sub-view filters", async () => {
    const filters: unknown[] = [];
    const screen = new ArtifactsScreen({
      caller: {
        artifacts: {
          list: async (input) => {
            filters.push(input);
            return [];
          },
          get: async () => null,
          upload: async () => ({ id: "artifact-1", filename: "noop", mime: "text/plain", path: "noop", sizeBytes: "0" }),
          download: async () => ({ ok: true, path: "/tmp/noop" }),
          archive: async (input) => ({ ok: true, id: input.id }),
          delete: async (input) => ({ ok: true, id: input.id }),
        },
      },
      runId: "run-1",
      taskId: "task-1",
    });

    await screen.load();
    expect(filters).toEqual([{ runId: "run-1", taskId: "task-1" }]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// prd-tui-stage-workbenches-set: Build & Ship stage workbench OD parity.
//
// The Build (`:runs`) and Ship (`:ship`) workbenches must render the OD
// `tui-runs.html` stage chrome: a `fulcrum · :<route> · <purpose>` header
// carrying the exact stage name, the StatusFooter strip, and the shared
// empty-state / error-frame contract. Snapshots are locked at 80x24 and
// 120x32 so the dense layout holds at both the minimum and a wide terminal.
// ───────────────────────────────────────────────────────────────────────────

describe("Build stage workbench (:runs): OD parity", () => {
  function buildScreen(runs: TuiManagedRunFixture[] = sampleRuns()) {
    return new RunsControlScreen({
      projectId: "auth/rewrite",
      projectLabel: "auth/rewrite",
      traceId: "tr_8f29a4c1b3e0",
      mcp: "7/7",
      caller: {
        agent_runs: {
          list: async () => runs,
          dispatch: async (input) => ({ id: "run-new", status: "pending", ...input }),
          cancel: async () => ({ ok: true }),
          retry: async () => ({ id: "run-r", agent: "codex", status: "pending" }),
          getDeps: async () => [],
        },
      },
    });
  }

  test("renders the Build workbench header, footer, and ModePicker at 80x24 and 120x32", async () => {
    const screen = buildScreen();
    await screen.load();
    for (const [cols, rows] of [[80, 24], [120, 32]] as const) {
      const snap = renderAt(cols, rows, (r) => screen.render(r));
      // Exact stage name in the OD term-head.
      expect(snap).toContain("Build");
      expect(snap).toContain("fulcrum · :runs · live agent sessions");
      // StatusFooter strip with the BUILD mode pill + OD segments.
      expect(snap).toContain("BUILD");
      expect(snap).toContain("profile: dev");
      expect(snap).toContain("run: run-1");
      expect(snap).toContain("trace tr_8f29a4");
      expect(snap).toContain("span span:run-");
      // Step-bearing rows expose the ModePicker affordance row.
      expect(snap).toContain("step modes");
      expect(snap).toContain("Manual");
    }
  });

  test("p/d/m honor the Play/Discuss/mode-picker contract", async () => {
    const screen = buildScreen();
    await screen.load();

    await screen.handleKey("p");
    expect(screen.currentStepMode).toBe("play");
    let rendered = renderPlain((renderer) => screen.render(renderer));
    expect(rendered).toContain("Play current step");
    expect(rendered).toContain("agent");
    expect(rendered).toContain("model");
    expect(rendered).toContain("policy");
    expect(rendered).toContain("Enter Play");
    expect(rendered).not.toContain("Dependencies for");

    await screen.handleKey("d");
    expect(screen.currentStepMode).toBe("discuss");
    rendered = renderPlain((renderer) => screen.render(renderer));
    expect(rendered).toContain("Discuss current step");
    expect(rendered).not.toContain("Dispatch run");

    await screen.handleKey("m");
    expect(screen.currentStepMode).toBe("discuss");
    rendered = renderPlain((renderer) => screen.render(renderer));
    expect(rendered).toContain("Mode picker");
  });

  test("empty Build workbench renders the shared one-sentence/one-action contract", async () => {
    const screen = buildScreen([]);
    await screen.load();
    const snap = renderAt(80, 24, (r) => screen.render(r));
    expect(snap).toContain("No agent runs in this stage yet.");
    expect(snap).toContain("Press D to dispatch a run.");
  });

  test("failed Build workbench renders the error frame with trace=<id>", async () => {
    const screen = new RunsControlScreen({
      traceId: "tr_56e3d12",
      caller: {
        agent_runs: {
          list: async () => {
            throw new Error("server unreachable");
          },
          dispatch: async () => ({ id: "x", agent: "codex", status: "pending" }),
          cancel: async () => ({ ok: true }),
          retry: async () => ({ id: "x", agent: "codex", status: "pending" }),
          getDeps: async () => [],
        },
      },
    });
    await screen.load();
    const snap = renderAt(120, 32, (r) => screen.render(r));
    expect(snap).toContain("Runs feed failed to load.");
    expect(snap).toContain("trace=tr_56e3d12");
  });
});

describe("Ship stage workbench (:ship): OD parity", () => {
  function shipScreen(list: () => Promise<unknown[]>) {
    return new ArtifactsScreen({
      projectLabel: "auth/rewrite",
      traceId: "tr_8f29a4c1b3e0",
      mcp: "7/7",
      caller: {
        artifacts: {
          list: list as never,
          get: async () => null,
          upload: async () => ({ id: "x", filename: "x", mime: "text/plain", path: "x", sizeBytes: "0" }),
          download: async () => ({ ok: true, path: "/tmp/x" }),
          archive: async (input) => ({ ok: true, id: input.id }),
          delete: async (input) => ({ ok: true, id: input.id }),
        },
      },
    });
  }

  test("renders the Ship workbench header + footer at 80x24 and 120x32", async () => {
    const screen = shipScreen(async () => [
      { id: "v2.18.0", filename: "auth-rewrite", mime: "application/zip", path: "rel/auth.zip", sizeBytes: "100" },
    ]);
    await screen.load();
    for (const [cols, rows] of [[80, 24], [120, 32]] as const) {
      const snap = renderAt(cols, rows, (r) => screen.render(r));
      expect(snap).toContain("Ship");
      expect(snap).toContain("fulcrum · :ship · artifacts");
      expect(snap).toContain("SHIP");
      expect(snap).toContain("trace tr_8f29a4");
    }
  });

  test("empty Ship workbench renders the shared empty-state contract", async () => {
    const screen = shipScreen(async () => []);
    await screen.load();
    const snap = renderAt(80, 24, (r) => screen.render(r));
    expect(snap).toContain("No artifacts in this stage yet.");
    expect(snap).toContain("Press u to upload a release artifact.");
  });

  test("failed Ship workbench renders the error frame with trace=<id>", async () => {
    const screen = shipScreen(async () => {
      throw new Error("artifact store offline");
    });
    await screen.load();
    const snap = renderAt(120, 32, (r) => screen.render(r));
    expect(snap).toContain("Artifacts feed failed to load.");
    expect(snap).toContain("trace=tr_8f29a4c1b3e0");
  });
});

interface TuiManagedRunFixture {
  id: string;
  agent: string;
  status: string;
  taskTitle?: string;
  projectName?: string;
}

function sampleRuns(): TuiManagedRunFixture[] {
  return [
    { id: "run-1", agent: "claude-opus-4.7", status: "running", taskTitle: "persist issuance row", projectName: "auth/rewrite" },
    { id: "run-2", agent: "gpt-5.4", status: "completed", taskTitle: "stripe webhook idempotency", projectName: "billing-3" },
    { id: "run-3", agent: "gemini-3-pro", status: "failed", taskTitle: "auth.events schema", projectName: "telemetry" },
  ];
}
