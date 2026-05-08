import { describe, expect, test } from "bun:test";

import { ContextPreviewScreen } from "../screens/context-preview.ts";
import { Renderer } from "../renderer.ts";
import { FakeTTY } from "../testing/fake-tty.ts";

describe("Phase 09.6 TUI knowledge workflow", () => {
  test("context preview requests deterministic task scope and renders source-ref panes", async () => {
    const calls: unknown[] = [];
    const screen = new ContextPreviewScreen({
      projectId: "proj_1",
      taskId: "task_1",
      includeGlobal: true,
      caller: {
        context: {
          preview: async (input: unknown) => {
            calls.push(input);
            return {
              snapshotId: "ctx_1",
              bundle: {
                tokenBudget: 8000,
                tokenCount: 64,
                slices: {
                  memories: { tokenCount: 10, content: "mem_1 accepted-project-memory" },
                  linkedDocs: { tokenCount: 18, content: "doc_1 linked-task-doc" },
                  recentRuns: { tokenCount: 20, content: "run_1 previous-output" },
                  repoState: { tokenCount: 16, content: "repo_1 clean" },
                },
              },
            };
          },
        },
      },
    });

    await screen.load();
    const tty = new FakeTTY({ columns: 120, rows: 30 });
    const renderer = new Renderer(tty);
    screen.render(renderer);

    expect(calls[0]).toEqual({ projectId: "proj_1", taskId: "task_1", includeGlobal: true });
    expect(tty.plainText()).toContain("doc_1 linked-task-doc");
    expect(tty.plainText()).toContain("mem_1 accepted-project");
    expect(tty.plainText()).toContain("snapshot ctx_1");
  });
});
