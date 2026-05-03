import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { describe, expect, test } from "vitest";

import { WikilinkNode } from "../../src/lib/components/editor/wikilink";

describe("WikilinkNode", () => {
  test.skipIf(typeof window === "undefined")("renders wikilink JSON as navigable chip", () => {
    const editor = new Editor({
      extensions: [StarterKit, WikilinkNode],
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "wikilink", attrs: { slug: "target-doc", resolved: true } }] },
        ],
      },
    });

    expect(editor.getHTML()).toContain('data-wikilink-slug="target-doc"');
    expect(editor.getHTML()).toContain('href="/docs/target-doc"');
    expect(editor.getHTML()).toContain("[[target-doc]]");
  });

  test.skipIf(typeof window === "undefined")("converts typed bracket syntax into wikilink node", () => {
    const editor = new Editor({
      extensions: [StarterKit, WikilinkNode],
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });

    editor.commands.insertContent("[[target-doc]]", { applyInputRules: true });

    expect(JSON.stringify(editor.getJSON())).toContain('"type":"wikilink"');
    expect(JSON.stringify(editor.getJSON())).toContain('"slug":"target-doc"');
  });
});
