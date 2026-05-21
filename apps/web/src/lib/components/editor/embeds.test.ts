import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Window } from "happy-dom";
import {
  createMermaidIframeSrcDoc,
  ExcalidrawNode,
  FileAttachmentNode,
  handleAttachmentFiles,
  ImageNode,
  MathBlockNode,
  MathNode,
  MermaidNode,
} from "./embeds";
import { createDocEditorExtensions, getSlashMenuItems, insertSlashMenuItem } from "./slash-menu";

const globals = globalThis as unknown as Record<string, unknown>;
const savedGlobals = {
  window: globals["window"],
  document: globals["document"],
  HTMLElement: globals["HTMLElement"],
  requestAnimationFrame: globals["requestAnimationFrame"],
};

// Every Editor created here is tracked so afterAll can destroy each one.
// A live ProseMirror view schedules deferred (setTimeout) focus/DOM work; if
// the editor outlives the suite, that timer fires after the happy-dom globals
// are restored and crashes the whole `bun test` run with `document is not
// defined`. Destroying every editor before global teardown prevents the leak.
const liveEditors: Editor[] = [];
function track(editor: Editor): Editor {
  liveEditors.push(editor);
  return editor;
}

beforeAll(() => {
  const window = new Window();
  window.SyntaxError = SyntaxError;
  // happy-dom's Window does not surface the ES URI helpers; PGlite-backed
  // tests that run later in the same process read `window.encodeURIComponent`.
  (window as unknown as Record<string, unknown>)["encodeURIComponent"] = encodeURIComponent;
  (window as unknown as Record<string, unknown>)["decodeURIComponent"] = decodeURIComponent;
  globals.window = window;
  globals.document = window.document;
  globals.HTMLElement = window.HTMLElement;
  globals.requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(callback, 0);
});

afterAll(() => {
  // Destroy every editor before restoring globals: a leaked ProseMirror view
  // would otherwise fire a deferred focus timer against a torn-down document.
  for (const editor of liveEditors.splice(0)) {
    try {
      editor.destroy();
    } catch {
      // Already destroyed or never mounted: nothing to clean up.
    }
  }
  // Restore the globals so later test files do not inherit a happy-dom window.
  for (const [key, value] of Object.entries(savedGlobals)) {
    if (value === undefined) delete globals[key];
    else globals[key] = value;
  }
});

describe("editor embeds", () => {
  test("math node renders valid inline and block expressions with fallback for invalid input", () => {
    const editor = track(new Editor({
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
    }));

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

    const editor = track(new Editor({
      extensions: [StarterKit, MermaidNode],
      content: {
        type: "doc",
        content: [{ type: "mermaid", attrs: { diagram } }],
      },
    }));

    const html = editor.getHTML();

    expect(html).toContain("iframe");
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).toContain("data-mermaid-diagram");
    expect(html).not.toContain("<script>window.__xss = true</script>");
  });

  test("excalidraw node stores base64 JSON data and renders a reopenable thumbnail", () => {
    const drawing = btoa(JSON.stringify({ elements: [{ id: "box-1", type: "rectangle" }] }));
    const editor = track(new Editor({
      extensions: [StarterKit, ExcalidrawNode],
      content: {
        type: "doc",
        content: [{ type: "excalidraw", attrs: { drawing, title: "System sketch" } }],
      },
    }));

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
    expect(extensionNames).toContain("image");
    expect(extensionNames).toContain("fileAttachment");
    expect(slashItemIds).toContain("file");
  });

  test("image node renders inline media with upload progress and error states", () => {
    const editor = track(new Editor({
      extensions: [StarterKit, ImageNode],
      content: {
        type: "doc",
        content: [
          { type: "image", attrs: { src: "/api/uploads/org-1/chart.png", alt: "chart.png" } },
          { type: "image", attrs: { src: "", alt: "uploading.png", uploading: true } },
          { type: "image", attrs: { src: "", alt: "failed.png", error: "Upload failed" } },
        ],
      },
    }));

    const html = editor.getHTML();

    expect(html).toContain('src="/api/uploads/org-1/chart.png"');
    expect(html).toContain('alt="chart.png"');
    expect(html).toContain("image-attachment--uploading");
    expect(html).toContain("data-upload-state=\"uploading\"");
    expect(html).toContain("image-attachment--error");
    expect(html).toContain("Upload failed");
  });

  test("file attachment node renders a downloadable chip with filename and size", () => {
    const editor = track(new Editor({
      extensions: [StarterKit, FileAttachmentNode],
      content: {
        type: "doc",
        content: [
          {
            type: "fileAttachment",
            attrs: {
              url: "/api/uploads/org-1/spec.pdf",
              filename: "spec.pdf",
              size: 1536,
              mime: "application/pdf",
            },
          },
        ],
      },
    }));

    const html = editor.getHTML();

    expect(html).toContain("file-attachment-chip");
    expect(html).toContain('href="/api/uploads/org-1/spec.pdf"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('download="spec.pdf"');
    expect(html).toContain("spec.pdf");
    expect(html).toContain("1.5 KB");
    expect(html).toContain("application/pdf");
  });

  test("file slash command inserts a placeholder attachment chip", () => {
    const editor = track(new Editor({
      extensions: createDocEditorExtensions(),
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "/file" }] }] },
    }));
    editor.commands.setTextSelection(6);

    const inserted = insertSlashMenuItem(editor, "file");

    expect(inserted).toBe(true);
    expect(editor.getJSON().content?.[0]?.type).toBe("fileAttachment");
    expect(editor.getJSON().content?.[0]?.attrs?.filename).toBe("Upload file");
    expect(editor.getHTML()).toContain("file-attachment-chip--uploading");
  });

  test("attachment file handler uploads images as image nodes and other files as chips", async () => {
    const editor = track(new Editor({
      extensions: createDocEditorExtensions(),
      content: { type: "doc", content: [{ type: "paragraph" }] },
    }));
    const uploads: File[] = [];
    const image = new File(["png"], "chart.png", { type: "image/png" });
    const pdf = new File(["pdf"], "brief.pdf", { type: "application/pdf" });

    await handleAttachmentFiles(editor, [image, pdf], async (file) => {
      uploads.push(file);
      return {
        url: `/api/uploads/org-1/${file.name}`,
        filename: file.name,
        size: file.size,
        mime: file.type,
      };
    });

    expect(uploads.map((file) => file.name)).toEqual(["chart.png", "brief.pdf"]);
    expect(editor.getJSON().content?.map((node) => node.type)).toContain("image");
    expect(editor.getJSON().content?.map((node) => node.type)).toContain("fileAttachment");
    expect(editor.getHTML()).toContain('src="/api/uploads/org-1/chart.png"');
    expect(editor.getHTML()).toContain("brief.pdf");
  });
});
