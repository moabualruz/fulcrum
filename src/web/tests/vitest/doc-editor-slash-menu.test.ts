import { Editor } from "@tiptap/core";
import { describe, expect, test, vi } from "vitest";
import {
  createDocEditorExtensions,
  filterSlashMenuItems,
  getSlashMenuItems,
  insertSlashMenuItem,
  createAutosaveScheduler,
} from "../../src/lib/components/editor/slash-menu";

function editorWithText(text = "/"): Editor {
  return new Editor({
    extensions: createDocEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  });
}

function jsonTypes(editor: Editor): string {
  return JSON.stringify(editor.getJSON());
}

describe("DocEditor slash menu helpers", () => {
  test("filters items by typed text and aliases", () => {
    expect(filterSlashMenuItems(getSlashMenuItems(), "heading-2").map((item) => item.id)).toEqual(["heading-2"]);
    expect(filterSlashMenuItems(getSlashMenuItems(), "quote").map((item) => item.id)).toEqual(["blockquote"]);
    expect(filterSlashMenuItems(getSlashMenuItems(), "check").map((item) => item.id)).toEqual(["task-list"]);
  });

  test.each([
    ["paragraph", "\"paragraph\""],
    ["heading-1", "\"heading\",\"attrs\":{\"level\":1"],
    ["heading-2", "\"heading\",\"attrs\":{\"level\":2"],
    ["heading-3", "\"heading\",\"attrs\":{\"level\":3"],
    ["heading-4", "\"heading\",\"attrs\":{\"level\":4"],
    ["heading-5", "\"heading\",\"attrs\":{\"level\":5"],
    ["heading-6", "\"heading\",\"attrs\":{\"level\":6"],
    ["bullet-list", "\"bulletList\""],
    ["ordered-list", "\"orderedList\""],
    ["task-list", "\"taskList\""],
    ["blockquote", "\"blockquote\""],
    ["code-block", "\"codeBlock\""],
    ["table", "\"table\""],
    ["horizontal-rule", "\"horizontalRule\""],
    ["template", "Template section"],
    ["wikilink", "\"type\":\"wikilink\""],
  ])("%s inserts expected node/content", (id, expected) => {
    const editor = editorWithText("/");

    insertSlashMenuItem(editor, id);

    expect(jsonTypes(editor)).toContain(expected);
  });

  test("autosave debounce coalesces rapid updates", () => {
    vi.useFakeTimers();
    const calls: unknown[] = [];
    const schedule = createAutosaveScheduler({
      delayMs: 2000,
      save: (json) => {
        calls.push(json);
      },
    });

    schedule({ type: "doc", content: [{ type: "paragraph" }] });
    schedule({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] });
    schedule({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "ab" }] }] });
    vi.advanceTimersByTime(1999);
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(1);

    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).toContain("ab");
    vi.useRealTimers();
  });
});
