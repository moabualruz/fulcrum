import { describe, expect, test } from "bun:test";
import { performance } from "node:perf_hooks";

import { DOC_TYPES } from "@knowledge-workspace/infrastructure/database/entities/docs/enums.ts";
import { Renderer } from "@fulcrum/tui/renderer.ts";
import {
  DocsReaderEditorScreen,
  renderMarkdown,
} from "@fulcrum/tui/screens/docs-reader-editor.ts";
import { DocsTreeScreen, type DocsTreeItem } from "@fulcrum/tui/screens/docs-tree.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 120, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

const docs = [
  {
    id: "global-parent",
    title: "Global Handbook",
    scope: "global",
    docType: "wiki",
    parentId: null,
    updatedAt: "2026-05-03T08:00:00Z",
  },
  {
    id: "global-child",
    title: "Install Notes",
    scope: "global",
    docType: "runbook",
    parentId: "global-parent",
    updatedAt: "2026-05-03T08:05:00Z",
  },
  {
    id: "project-parent",
    title: "Project Spec",
    scope: "project",
    projectId: "project-1",
    docType: "spec",
    parentId: null,
    updatedAt: "2026-05-03T09:00:00Z",
  },
  {
    id: "project-child",
    title: "Project ADR",
    scope: "project",
    projectId: "project-1",
    docType: "adr",
    parentId: "project-parent",
    updatedAt: "2026-05-03T09:10:00Z",
  },
];

describe("DocsTreeScreen", () => {
  test("mounts from docs.tree, navigates 100+ docs, opens reader, archives, creates, and toggles scope", async () => {
    const treeCalls: unknown[] = [];
    const createCalls: unknown[] = [];
    const deleteCalls: unknown[] = [];
    const opened: string[] = [];
    const projectDocs: DocsTreeItem[] = Array.from({ length: 120 }, (_, index) => ({
      id: `project-${index}`,
      title: `Project ${String(index).padStart(3, "0")}`,
      slug: `project-${index}`,
      scope: "project",
      projectId: "project-1",
      docType: "wiki",
      parentId: null,
    }));
    const globalDocs: DocsTreeItem[] = [
      {
        id: "global-0",
        title: "Global Handbook",
        slug: "global-handbook",
        scope: "global",
        docType: "runbook",
        parentId: null,
      },
    ];
    let currentDocs = [...projectDocs];
    const screen = new DocsTreeScreen({
      projectId: "project-1",
      caller: {
        docs: {
          tree: async (input) => {
            treeCalls.push(input);
            currentDocs = input.scope === "global" ? [...globalDocs] : [...projectDocs];
            return currentDocs;
          },
          list: async () => {
            throw new Error("docs.tree must be used when available");
          },
          create: async (input) => {
            createCalls.push(input);
            const created = {
              id: "created-doc",
              title: input.title,
              slug: "created-doc",
              scope: input.scope,
              projectId: input.projectId,
              docType: input.docType,
              parentId: null,
            };
            currentDocs = [created, ...currentDocs];
            return created;
          },
          delete: async (input) => {
            deleteCalls.push(input);
            currentDocs = currentDocs.filter((doc) => doc.id !== input.id);
            return { ...projectDocs[1]!, archived: true };
          },
        },
      },
      onOpenDoc: (id) => opened.push(id),
    });

    const start = performance.now();
    await screen.load();
    const treeMs = performance.now() - start;
    expect(treeMs).toBeLessThan(500);
    expect(treeCalls).toEqual([{ scope: "project", projectId: "project-1" }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Project 000");

    await screen.handleKey("\x1b[B");
    await screen.handleKey("\r");
    expect(opened).toEqual(["project-1"]);

    await screen.handleKey("d");
    expect(deleteCalls).toEqual([{ id: "project-1", hard: false }]);
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("Project 001");

    await screen.handleKey("n");
    await screen.handleKey("\r");
    await screen.submitNewDocTitle("Fresh Spec");
    expect(createCalls).toEqual([{ title: "Fresh Spec", docType: "spec", scope: "project", projectId: "project-1" }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Fresh Spec");

    await screen.handleKey("g");
    expect(treeCalls.at(-1)).toEqual({ scope: "global" });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Global Handbook");
  });

  test("renders project and global trees, expands/collapses nodes, opens reader, and creates docs with type picker", async () => {
    const opened: string[] = [];
    const created: unknown[] = [];
    const screen = new DocsTreeScreen({
      projectId: "project-1",
      caller: {
        docs: {
          list: async () => docs,
          create: async (input) => {
            created.push(input);
            return {
              id: "doc-new",
              title: String(input.title),
              scope: input.scope,
              projectId: input.projectId,
              parentId: null,
              docType: input.docType,
              updatedAt: "2026-05-03T10:00:00Z",
            };
          },
        },
      },
      onOpenDoc: (id) => opened.push(id),
    });

    await screen.load();
    const initial = renderPlain((renderer) => screen.render(renderer));
    expect(initial).toContain("Project Docs");
    expect(initial).toContain("Global Docs");
    expect(initial).toContain("Project Spec");
    expect(initial).toContain("Global Handbook");
    expect(initial).not.toContain("Project ADR");

    await screen.handleKey("\x1b[C");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Project ADR");
    await screen.handleKey("\x1b[D");
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("Project ADR");

    await screen.handleKey("\r");
    expect(opened).toEqual(["project-parent"]);

    await screen.handleKey("n");
    const picker = renderPlain((renderer) => screen.render(renderer));
    expect(picker).toContain("New doc type");
    for (const docType of DOC_TYPES) expect(picker).toContain(docType);

    await screen.handleKey("\r");
    await screen.submitNewDocTitle("Fresh Spec");
    expect(created).toEqual([{ title: "Fresh Spec", docType: "spec", scope: "project", projectId: "project-1" }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Fresh Spec");
  });
});

describe("DocsReaderEditorScreen", () => {
  test("reader and editor save body using current docs runtime shape", async () => {
    const updates: unknown[] = [];
    const doc = {
      id: "doc-1",
      title: "Reader Spec",
      slug: "reader-spec",
      docType: "spec",
      scope: "project",
      projectId: "project-1",
      parentId: null,
      body: "# Reader Spec\n\nSee [[source-doc]] and **bold** with `inline`.",
      updatedAt: "2026-05-03T08:00:00Z",
    };
    const screen = new DocsReaderEditorScreen({
      docId: "doc-1",
      caller: {
        docs: {
          get: async () => doc,
          update: async (input) => {
            updates.push(input);
            doc.body = input.body;
            return doc;
          },
        },
      },
    });

    await screen.load();
    const renderStart = performance.now();
    const reader = renderPlain((renderer) => screen.render(renderer));
    expect(performance.now() - renderStart).toBeLessThan(100);
    expect(reader).toContain("Reader Spec");
    expect(reader).toContain("See [[source-doc]] and bold with inline.");
    expect(reader).not.toContain("{\"slug\"");

    await screen.handleKey("e");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("title: Reader Spec");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("See [[source-doc]]");
    screen.setEditorBody("# Reader Spec\n\nChanged [[source-doc]]");
    await screen.handleKey("\x13");
    expect(updates.at(-1)).toMatchObject({
      id: "doc-1",
      title: "Reader Spec",
      docType: "spec",
      scope: "project",
      projectId: "project-1",
      parentId: null,
      body: "# Reader Spec\n\nChanged [[source-doc]]",
    });
  });

  test("markdown renderer handles 10 kB body under reader budget", () => {
    const body = `# Large\n\n${"See [[slug]] with `code` and **bold**.\n".repeat(280)}`;
    expect(body.length).toBeGreaterThan(10_000);
    const start = performance.now();
    const lines = renderMarkdown(body);
    expect(performance.now() - start).toBeLessThan(100);
    expect(lines.join("\n")).toContain("[[slug]] with code and bold.");
  });

  test("renders markdown as ANSI-safe plain text and saves frontmatter plus body without data loss", async () => {
    const updates: unknown[] = [];
    const storedDoc = {
      id: "doc-1",
      title: "Reader Spec",
      docType: "spec",
      scope: "project",
      projectId: "project-1",
      parentId: null,
      body: "# Reader Spec\n\n- keep [[Wiki Link]] visible\n\n```ts\nconst x = `inline`;\n```\n\nUse `code`.",
      updatedAt: "2026-05-03T08:00:00Z",
    };
    const screen = new DocsReaderEditorScreen({
      docId: "doc-1",
      caller: {
        docs: {
          get: async () => storedDoc,
          update: async (input) => {
            updates.push(input);
            storedDoc.body = String(input.body);
            return { ok: true };
          },
        },
      },
    });

    await screen.load();
    const reader = renderPlain((renderer) => screen.render(renderer));
    expect(reader).toContain("Reader Spec");
    expect(reader).toContain("- keep [[Wiki Link]] visible");
    expect(reader).toContain("const x = `inline`;");
    expect(reader).toContain("Use code.");
    expect(reader).not.toContain("# Reader Spec");
    expect(reader).not.toContain("```");

    await screen.handleKey("e");
    const editor = renderPlain((renderer) => screen.render(renderer));
    expect(editor).toContain("title: Reader Spec");
    expect(editor).toContain("docType: spec");
    expect(editor).toContain("scope: project");
    expect(editor).toContain("---");

    screen.setEditorBody("# Reader Spec\n\nChanged [[Wiki Link]]\n\n```ts\nconst y = 2;\n```");
    await screen.handleKey("\x13");
    expect(updates).toEqual([
      {
        id: "doc-1",
        title: "Reader Spec",
        docType: "spec",
        scope: "project",
        projectId: "project-1",
        parentId: null,
        body: "# Reader Spec\n\nChanged [[Wiki Link]]\n\n```ts\nconst y = 2;\n```",
      },
    ]);

    await screen.load();
    expect(screen.editorBody).toBe("# Reader Spec\n\nChanged [[Wiki Link]]\n\n```ts\nconst y = 2;\n```");
  });
});
