import { describe, expect, test } from "bun:test";

import { DOC_TYPES } from "../../src/db/entities/docs/enums.ts";
import { Renderer } from "../../src/tui/renderer.ts";
import { DocsReaderEditorScreen } from "../../src/tui/screens/docs-reader-editor.ts";
import { DocsTreeScreen } from "../../src/tui/screens/docs-tree.ts";
import { FakeTTY } from "../../src/tui/testing/fake-tty.ts";

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
