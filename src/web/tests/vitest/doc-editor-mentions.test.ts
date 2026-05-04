import { Editor } from "@tiptap/core";
import { describe, expect, test } from "vitest";
import { createDocEditorExtensions } from "../../src/lib/components/editor/slash-menu";

function editorWithText(text: string): Editor {
  const paragraph = text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };
  return new Editor({
    extensions: createDocEditorExtensions(),
    content: {
      type: "doc",
      content: [paragraph],
    },
  });
}

describe("DocEditor mention nodes", () => {
  test.each([
    ["@user:alice", "user", "alice", "@alice", "mention-chip--user"],
    ["@team:platform", "team", "platform", "@platform", "mention-chip--team"],
  ])("converts %s into a non-editable mention chip", (typed, kind, id, label, className) => {
    const editor = editorWithText("");

    editor.chain().focus().insertContent(typed).run();

    const json = editor.getJSON();
    expect(JSON.stringify(json)).toContain("\"type\":\"mention\"");
    expect(JSON.stringify(json)).toContain(`"kind":"${kind}"`);
    expect(JSON.stringify(json)).toContain(`"id":"${id}"`);
    expect(JSON.stringify(json)).toContain(`"label":"${label}"`);

    const html = editor.getHTML();
    expect(html).toContain(`data-mention-kind="${kind}"`);
    expect(html).toContain(`data-mention-id="${id}"`);
    expect(html).toContain(className);
    expect(html).toContain("contenteditable=\"false\"");
  });

  test("parses rendered mention chip back into mention JSON", () => {
    const editor = new Editor({
      extensions: createDocEditorExtensions(),
      content: "<p>Hello <span data-mention-kind=\"user\" data-mention-id=\"alice\" data-mention-label=\"@Alice\">@Alice</span></p>",
    });

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            { type: "mention", attrs: { kind: "user", id: "alice", label: "@Alice" } },
          ],
        },
      ],
    });
  });
});
