import { beforeAll, describe, expect, test } from "bun:test";
import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Window } from "happy-dom";
import {
  createMermaidIframeSrcDoc,
  ExcalidrawNode,
  MathBlockNode,
  MathNode,
  MermaidNode,
} from "./embeds";
import { createDocEditorExtensions, getSlashMenuItems } from "./slash-menu";

beforeAll(() => {
  const window = new Window();
  window.SyntaxError = SyntaxError;
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = window;
  globals.document = window.document;
  globals.HTMLElement = window.HTMLElement;
});

describe("editor embeds", () => {
  test("math node renders valid inline and block expressions with fallback for invalid input", () => {
    const editor = new Editor({
      extensions: [StarterKit, MathNode, MathBlockNode],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "math", attrs: { expression: "E=mc^2", displayMode: false } }],
          },
          { type: "mathBlock", attrs: { expression: "\\frac{a}{b}" } },
          { type: "mathBlock", attrs: { expression: "\\invalid{" } },
        ],
      },
    });

    const html = editor.getHTML();

    expect(html).toContain('data-math-expression="E=mc^2"');
    expect(html).toContain("math-embed--inline");
    expect(html).toContain("math-embed--block");
    expect(html).toContain("katex-rendered");
    expect(html).toContain("math-embed--error");
    expect(html).toContain("\\invalid{");
  });

  test("mermaid node renders a sandboxed iframe without raw diagram HTML injection", () => {
    const diagram = 'graph TD; A["<script>window.__xss = true</script>"]-->B;';
    const srcdoc = createMermaidIframeSrcDoc(diagram);

    expect(srcdoc).not.toContain("<script>window.__xss = true</script>");
    expect(srcdoc).toContain("Diagram syntax error");
    expect(srcdoc).toContain("mermaid.initialize");

    const editor = new Editor({
      extensions: [StarterKit, MermaidNode],
      content: {
        type: "doc",
        content: [{ type: "mermaid", attrs: { diagram } }],
      },
    });

    const html = editor.getHTML();

    expect(html).toContain("iframe");
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).toContain("data-mermaid-diagram");
    expect(html).not.toContain("<script>window.__xss = true</script>");
  });

  test("excalidraw node stores base64 JSON data and renders a reopenable thumbnail", () => {
    const drawing = btoa(JSON.stringify({ elements: [{ id: "box-1", type: "rectangle" }] }));
    const editor = new Editor({
      extensions: [StarterKit, ExcalidrawNode],
      content: {
        type: "doc",
        content: [{ type: "excalidraw", attrs: { drawing, title: "System sketch" } }],
      },
    });

    const html = editor.getHTML();

    expect(html).toContain("excalidraw-embed");
    expect(html).toContain('data-excalidraw-drawing="');
    expect(html).toContain(drawing);
    expect(html).toContain("System sketch");
    expect(html).toContain("Open sketch");
  });

  test("doc editor extension registry and slash menu include all embed nodes", () => {
    const extensionNames = createDocEditorExtensions().map((extension) => extension.name);
    const slashItemIds = getSlashMenuItems().map((item) => item.id);

    expect(extensionNames).toContain("math");
    expect(extensionNames).toContain("mathBlock");
    expect(extensionNames).toContain("mermaid");
    expect(extensionNames).toContain("excalidraw");
    expect(slashItemIds).toContain("math");
    expect(slashItemIds).toContain("math-block");
    expect(slashItemIds).toContain("mermaid");
    expect(slashItemIds).toContain("sketch");
  });
});
