import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import { Renderer } from "../../src/tui/renderer.ts";
import { ArtifactsScreen } from "../../src/tui/screens/artifacts.ts";
import { RunDetailScreen, RunsScreen } from "../../src/tui/screens/runs.ts";
import { SubscriptionBridge } from "../../src/tui/subscriptions.ts";
import { FakeTTY } from "../../src/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 120, rows: 40 });
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
    for (const status of ["[running]", "[completed]", "[failed]", "[cancelled]"]) expect(listing).toContain(status);

    await screen.handleKey("d");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Dispatch run");

    await screen.submitDispatch({ projectId: "project-1", taskId: "task-1", agent: "codex" });
    expect(created).toEqual([{ projectId: "project-1", taskId: "task-1", agent: "codex" }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("run-new");

    await screen.handleKey("\r");
    expect(opened).toEqual(["run-new"]);
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
