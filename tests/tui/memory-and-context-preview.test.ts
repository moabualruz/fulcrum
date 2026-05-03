import { describe, expect, test } from "bun:test";

import { Renderer } from "../../src/tui/renderer.ts";
import { ContextPreviewScreen } from "../../src/tui/screens/context-preview.ts";
import { MemoryBrowserScreen } from "../../src/tui/screens/memory-browser.ts";
import { FakeTTY } from "../../src/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 140, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

const memories = [
  {
    id: "memory-1",
    projectId: "project-1",
    kind: "decision",
    key: "deterministic-context",
    body: "Use deterministic context assembly before every agent run.",
    tags: ["context", "agents"],
    importance: "high",
    global: false,
    updatedAt: "2026-05-03T08:00:00Z",
  },
  {
    id: "memory-2",
    projectId: null,
    kind: "fact",
    key: "global-rules",
    body: "Global memory applies across repositories.",
    tags: ["global"],
    importance: "medium",
    global: true,
    updatedAt: "2026-05-03T09:00:00Z",
  },
];

describe("MemoryBrowserScreen", () => {
  test("lists project and global memories, filters/searches, opens detail, and promotes selected memory", async () => {
    const listInputs: unknown[] = [];
    const promoted: string[] = [];
    const screen = new MemoryBrowserScreen({
      projectId: "project-1",
      caller: {
        memories: {
          list: async (input = {}) => {
            listInputs.push(input);
            return memories;
          },
          promote: async (input) => {
            promoted.push(input.id);
            const memory = memories.find((item) => item.id === input.id);
            if (memory) memory.global = true;
            return { ok: true };
          },
        },
      },
    });

    await screen.load();
    const initial = renderPlain((renderer) => screen.render(renderer));
    expect(initial).toContain("Memory");
    expect(initial).toContain("deterministic-context");
    expect(initial).toContain("global-rules");
    expect(initial).toContain("Use deterministic context assembly");

    await screen.handleKey("g");
    const globalOnly = renderPlain((renderer) => screen.render(renderer));
    expect(globalOnly).toContain("Global only");
    expect(globalOnly).toContain("global-rules");
    expect(globalOnly).not.toContain("deterministic-context");

    await screen.handleKey("g");
    await screen.handleKey("/");
    screen.setSearchQuery("deterministic");
    const searched = renderPlain((renderer) => screen.render(renderer));
    expect(searched).toContain("Search: deterministic");
    expect(searched).toContain("deterministic-context");
    expect(searched).not.toContain("global-rules");

    await screen.handleKey("\r");
    const detail = renderPlain((renderer) => screen.render(renderer));
    expect(detail).toContain("Memory detail");
    expect(detail).toContain("Use deterministic context assembly before every agent run.");

    await screen.handleKey("p");
    expect(promoted).toEqual(["memory-1"]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("[global]");
    expect(listInputs[0]).toEqual({ projectId: "project-1" });
  });
});

describe("ContextPreviewScreen", () => {
  test("renders four context panes with per-pane token counts, total budget, and refresh", async () => {
    let calls = 0;
    const screen = new ContextPreviewScreen({
      taskId: "task-1",
      caller: {
        context: {
          assemble: async () => {
            calls += 1;
            return {
              bundle: {
                taskId: "task-1",
                tokenBudget: 2048,
                tokenCount: calls === 1 ? 60 : 65,
                slices: {
                  memories: { tokenCount: 10, content: "Memory: deterministic context" },
                  linkedDocs: { tokenCount: 20, content: "Doc: Agent OS vision" },
                  recentRuns: { tokenCount: 15, content: "Run: previous TUI work" },
                  repoState: { tokenCount: calls === 1 ? 15 : 20, content: "Branch plan/agent-os-vision" },
                  skillPrompts: { tokenCount: 100, content: "Not shown in preview pane" },
                },
              },
              snapshotId: "snapshot-1",
            };
          },
        },
      },
    });

    await screen.load();
    const preview = renderPlain((renderer) => screen.render(renderer));
    for (const pane of ["Memories (10 tokens)", "Linked docs (20 tokens)", "Recent transcripts (15 tokens)", "Repo state (15 tokens)"]) {
      expect(preview).toContain(pane);
    }
    expect(preview).toContain("60/2048 tokens");
    expect(preview).not.toContain("Skill prompts");

    await screen.handleKey("r");
    expect(calls).toBe(2);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("65/2048 tokens");
  });
});
