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
    source: "manual",
    global: false,
    updatedAt: "2026-05-03T08:00:00Z",
    links: [{ targetKind: "doc", targetId: "doc-1", label: "Agent OS vision" }],
  },
  {
    id: "memory-2",
    projectId: null,
    kind: "fact",
    key: "global-rules",
    body: "Global memory applies across repositories.",
    tags: ["global"],
    importance: "medium",
    source: "heuristic",
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
          search: async () => memories,
          archive: async () => ({ ok: true }),
          delete: async () => ({ deleted: true }),
          update: async (input) => ({ ...memories[0]!, ...input }),
        },
      },
    });

    await screen.load();
    const initial = renderPlain((renderer) => screen.render(renderer));
    expect(initial).toContain("Memory");
    expect(initial).toContain("deterministic-context");
    expect(initial).toContain("global-rules");
    expect(initial).toContain("Use deterministic context assembly");

    await screen.handleKey("G");
    const globalOnly = renderPlain((renderer) => screen.render(renderer));
    expect(globalOnly).toContain("Global only");
    expect(globalOnly).toContain("global-rules");
    expect(globalOnly).not.toContain("deterministic-context");

    await screen.handleKey("G");
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

  test("renders facets, filters rows from selected facet, and shows linked entities in detail", async () => {
    const screen = new MemoryBrowserScreen({
      projectId: "project-1",
      caller: {
        memory: {
          list: async () => memories,
          promote: async () => ({ ok: true }),
          search: async () => memories,
          archive: async () => ({ ok: true }),
          delete: async () => ({ deleted: true }),
          update: async (input) => ({ ...memories[0]!, ...input }),
        },
      },
    });

    await screen.load();
    const initial = renderPlain((renderer) => screen.render(renderer));
    for (const facet of ["Facets", "kind", "importance", "source", "project", "decision", "high", "manual", "project-1"]) {
      expect(initial).toContain(facet);
    }

    await screen.handleKey("f");
    await screen.handleKey("\r");
    const filtered = renderPlain((renderer) => screen.render(renderer));
    expect(filtered).toContain("Filter: kind=decision");
    expect(filtered).toContain("deterministic-context");
    expect(filtered).not.toContain("global-rules");

    await screen.handleKey("\r");
    const detail = renderPlain((renderer) => screen.render(renderer));
    expect(detail).toContain("Linked entities");
    expect(detail).toContain("doc:doc-1");
    expect(detail).toContain("Agent OS vision");
  });

  test("searches through memory.search with debounce and replaces the list", async () => {
    const searches: unknown[] = [];
    const screen = new MemoryBrowserScreen({
      projectId: "project-1",
      searchDebounceMs: 5,
      caller: {
        memory: {
          list: async () => memories,
          promote: async () => ({ ok: true }),
          search: async (input) => {
            searches.push(input);
            return [memories[1]!];
          },
          archive: async () => ({ ok: true }),
          delete: async () => ({ deleted: true }),
          update: async (input) => ({ ...memories[0]!, ...input }),
        },
      },
    });

    await screen.load();
    screen.setSearchQuery("global");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(searches).toEqual([{ projectId: "project-1", query: "global" }]);
    const rendered = renderPlain((renderer) => screen.render(renderer));
    expect(rendered).toContain("Search: global");
    expect(rendered).toContain("global-rules");
    expect(rendered).not.toContain("deterministic-context");
  });

  test("archives, confirms delete, and opens inline edit for selected memory", async () => {
    const archived: string[] = [];
    const deleted: string[] = [];
    const updates: unknown[] = [];
    const screen = new MemoryBrowserScreen({
      caller: {
        memory: {
          list: async () => memories,
          promote: async () => ({ ok: true }),
          search: async () => memories,
          archive: async (input) => {
            archived.push(input.id);
            return { ok: true };
          },
          delete: async (input) => {
            deleted.push(input.id);
            return { deleted: true };
          },
          update: async (input) => {
            updates.push(input);
            return { ...memories[0]!, ...input };
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey("e");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Edit memory");
    await screen.submitEdit({ body: "Updated memory body.", importance: "medium", tags: ["edited"] });
    expect(updates).toEqual([{ id: "memory-1", body: "Updated memory body.", importance: "medium", tags: ["edited"], forceEdit: true }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Updated memory body.");

    await screen.handleKey("a");
    expect(archived).toEqual(["memory-1"]);
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("deterministic-context");

    await screen.handleKey("d");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Delete global-rules? [y/N]");
    await screen.handleKey("y");
    expect(deleted).toEqual(["memory-2"]);
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("global-rules");
  });

  test("renders empty state with remember shortcut", async () => {
    const screen = new MemoryBrowserScreen({
      projectId: "project-empty",
      caller: {
        memory: {
          list: async () => [],
          promote: async () => ({ ok: true }),
          search: async () => [],
          archive: async () => ({ ok: true }),
          delete: async () => ({ deleted: true }),
          update: async (input) => input,
        },
      },
    });

    await screen.load();
    const rendered = renderPlain((renderer) => screen.render(renderer));
    expect(rendered).toContain("No memories for this project.");
    expect(rendered).toContain("Press r to run memory remember");
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
