import { describe, expect, test } from "bun:test";

import { Renderer } from "../renderer.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import { DocsReaderEditorScreen } from "./docs-reader-editor.ts";

describe("DocsReaderEditorScreen", () => {
  test("loads and renders document metadata through thin caller methods", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const screen = new DocsReaderEditorScreen({
      docId: "doc-1",
      caller: {
        docs: {
          get: async (input) => {
            calls.push(["get", input]);
            return {
              id: "doc-1",
              title: "Planning brief",
              docType: "spec",
              scope: "project",
              projectId: "project-1",
              body: "## Goal\n\nPreserve workflow value.",
            };
          },
          update: async (input) => {
            calls.push(["update", input]);
            return { ok: true };
          },
          listBacklinks: async (input) => {
            calls.push(["listBacklinks", input]);
            return [{ id: "source-doc", title: "Source doc", href: "/docs/source-doc" }];
          },
          listComments: async (input) => {
            calls.push(["listComments", input]);
            return [{ id: "comment-1", bodyMd: "Needs criteria.", authorId: "user-1", status: "open" }];
          },
          listAttachments: async (input) => {
            calls.push(["listAttachments", input]);
            return [{ id: "attachment-1", fileName: "brief.pdf", mimeType: "application/pdf", sizeBytes: 42 }];
          },
          listCollaborationStates: async (input) => {
            calls.push(["listCollaborationStates", input]);
            return [{ id: "state-1", provider: "hocuspocus", activeClientIds: ["client-1"] }];
          },
        },
      },
    });

    await screen.load();
    const tty = new FakeTTY({ columns: 120, rows: 40 });
    const renderer = new Renderer(tty);
    screen.render(renderer);

    expect(calls).toEqual([
      ["get", { id: "doc-1" }],
      ["listBacklinks", { docId: "doc-1" }],
      ["listComments", { docId: "doc-1" }],
      ["listAttachments", { docId: "doc-1" }],
      ["listCollaborationStates", { docId: "doc-1" }],
    ]);
    expect(tty.plainText()).toContain("Planning brief");
    expect(tty.plainText()).toContain("Source doc");
    expect(tty.plainText()).toContain("Needs criteria.");
    expect(tty.plainText()).toContain("brief.pdf");
    expect(tty.plainText()).toContain("application/pdf");
    expect(tty.plainText()).toContain("hocuspocus");
    expect(tty.plainText()).toContain("1 clients");
  });
});
