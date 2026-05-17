import { mergeAttributes, Node, type Editor } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";

const DEFAULT_MATH = "E=mc^2";
const DEFAULT_MERMAID = "graph TD;\n  A[Start] --> B[Next]";
const EMPTY_SKETCH = btoa(JSON.stringify({ type: "excalidraw", version: 2, source: "fulcrum", elements: [] }));

export type UploadedAttachment = {
  url: string;
  filename: string;
  size: number;
  mime: string;
};

export type AttachmentUploader = (file: File) => Promise<UploadedAttachment>;

export const ImageNode = Node.create({
  name: "image",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      title: { default: "" },
      filename: { default: "" },
      size: { default: 0 },
      mime: { default: "" },
      uploading: { default: false },
      error: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }, { tag: "figure[data-image-attachment]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return renderImageHTML(HTMLAttributes);
  },
});

export const FileAttachmentNode = Node.create({
  name: "fileAttachment",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      url: { default: "" },
      filename: { default: "Upload file" },
      size: { default: 0 },
      mime: { default: "" },
      uploading: { default: false },
      error: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-file-attachment]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return renderFileAttachmentHTML(HTMLAttributes);
  },
});

export const MathNode = Node.create({
  name: "math",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      expression: { default: DEFAULT_MATH },
      displayMode: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-math-expression]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return renderMathHTML(HTMLAttributes.expression, false, HTMLAttributes);
  },
});

export const MathBlockNode = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      expression: { default: DEFAULT_MATH },
      displayMode: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-math-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return renderMathHTML(HTMLAttributes.expression, true, HTMLAttributes);
  },
});

export const MermaidNode = Node.create({
  name: "mermaid",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      diagram: { default: DEFAULT_MERMAID },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-mermaid-diagram]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const diagram = String(HTMLAttributes.diagram ?? "");
    return [
      "div",
      {
        "data-mermaid-diagram": btoa(unescape(encodeURIComponent(diagram))),
        class: "mermaid-embed",
      },
      [
        "iframe",
        {
          sandbox: "allow-scripts",
          srcdoc: createMermaidIframeSrcDoc(diagram),
          title: "Mermaid diagram",
          class: "mermaid-embed__frame",
        },
      ],
    ];
  },
});

export const ExcalidrawNode = Node.create({
  name: "excalidraw",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      drawing: { default: EMPTY_SKETCH },
      title: { default: "Sketch" },
    };
  },

  parseHTML() {
    return [{ tag: "button[data-excalidraw-drawing]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const drawing = String(HTMLAttributes.drawing ?? EMPTY_SKETCH);
    const title = String(HTMLAttributes.title ?? "Sketch");
    return [
      "button",
      mergeAttributes(HTMLAttributes, {
        type: "button",
        "data-excalidraw-drawing": drawing,
        "data-excalidraw-title": title,
        class: "excalidraw-embed",
        title: "Open sketch",
      }),
      ["span", { class: "excalidraw-embed__thumbnail", "aria-hidden": "true" }, ""],
      ["span", { class: "excalidraw-embed__title" }, title],
    ];
  },
});

export function createMermaidIframeSrcDoc(diagram: string): string {
  const safeDiagram = JSON.stringify(diagram).replace(/<\//g, "<\\/");
  return `<!doctype html>
<html>
<body>
<div id="diagram"></div>
<div id="error" hidden>Diagram syntax error</div>
<script type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
const diagram = ${safeDiagram};
mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
try {
  const result = await mermaid.render("fulcrum-mermaid", diagram);
  document.getElementById("diagram").innerHTML = result.svg;
} catch {
  document.getElementById("error").hidden = false;
}
</script>
</body>
</html>`;
}

export async function uploadAttachment(file: File): Promise<UploadedAttachment> {
  const body = new FormData();
  body.set("file", file);
  const response = await fetch("/api/upload", { method: "POST", body });
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }
  return await response.json() as UploadedAttachment;
}

export async function handleAttachmentFiles(
  editor: Editor,
  files: Iterable<File>,
  uploader: AttachmentUploader = uploadAttachment,
): Promise<boolean> {
  let handled = false;
  for (const file of files) {
    handled = true;
    const placeholderType = isImageFile(file) ? "image" : "fileAttachment";
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: placeholderType,
      attrs: attachmentAttrs({
        url: "",
        filename: file.name,
        size: file.size,
        mime: file.type,
        uploading: true,
      }),
    });

    try {
      const uploaded = await uploader(file);
      replaceLastUploadingAttachment(editor, placeholderType, uploaded);
    } catch (error) {
      replaceLastUploadingAttachment(editor, placeholderType, {
        url: "",
        filename: file.name,
        size: file.size,
        mime: file.type,
        error: error instanceof Error ? error.message : "Upload failed",
      });
    }
  }
  return handled;
}

export function attachmentAttrs(uploaded: UploadedAttachment & { uploading?: boolean; error?: string }): Record<string, unknown> {
  return {
    ...uploaded,
    src: uploaded.url,
    alt: uploaded.filename,
    uploading: uploaded.uploading ?? false,
    error: uploaded.error ?? "",
  };
}

export function formatAttachmentSize(size: unknown): string {
  const bytes = Number(size ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes % 1024 === 0 ? 0 : 1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderImageHTML(HTMLAttributes: Record<string, unknown>): DOMOutputSpec {
  const src = String(HTMLAttributes.src ?? "");
  const alt = String(HTMLAttributes.alt || HTMLAttributes.filename || "");
  const title = String(HTMLAttributes.title ?? "");
  const uploading = Boolean(HTMLAttributes.uploading);
  const error = String(HTMLAttributes.error ?? "");
  const stateClass = uploading ? " image-attachment--uploading" : error ? " image-attachment--error" : "";
  const state = uploading ? "uploading" : error ? "error" : "ready";

  return [
    "figure",
    mergeAttributes(HTMLAttributes, {
      "data-image-attachment": "true",
      "data-upload-state": state,
      class: `image-attachment${stateClass}`,
    }),
    ["img", { src, alt, title }],
    uploading ? ["figcaption", { class: "image-attachment__status" }, "Uploading"] : "",
    error ? ["figcaption", { class: "image-attachment__error" }, error] : "",
  ];
}

function renderFileAttachmentHTML(HTMLAttributes: Record<string, unknown>): DOMOutputSpec {
  const url = String(HTMLAttributes.url ?? "");
  const filename = String(HTMLAttributes.filename ?? "Upload file");
  const mime = String(HTMLAttributes.mime ?? "");
  const uploading = Boolean(HTMLAttributes.uploading);
  const error = String(HTMLAttributes.error ?? "");
  const stateClass = uploading ? " file-attachment-chip--uploading" : error ? " file-attachment-chip--error" : "";

  return [
    "a",
    mergeAttributes(HTMLAttributes, {
      href: url || "#",
      target: "_blank",
      rel: "noreferrer",
      download: filename,
      "data-file-attachment": "true",
      "data-upload-state": uploading ? "uploading" : error ? "error" : "ready",
      class: `file-attachment-chip${stateClass}`,
    }),
    ["span", { class: "file-attachment-chip__icon", "aria-hidden": "true" }, "file"],
    ["span", { class: "file-attachment-chip__name" }, filename],
    ["span", { class: "file-attachment-chip__meta" }, `${formatAttachmentSize(HTMLAttributes.size)}${mime ? ` ${mime}` : ""}`],
    error ? ["span", { class: "file-attachment-chip__error" }, error] : "",
  ];
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function replaceLastUploadingAttachment(
  editor: Editor,
  type: string,
  attrs: UploadedAttachment & { error?: string },
): void {
  const { doc, tr } = editor.state;
  let matchPosition: number | null = null;
  doc.descendants((node, position) => {
    if (node.type.name === type && node.attrs.uploading) {
      matchPosition = position;
    }
  });
  if (matchPosition === null) return;
  const node = doc.nodeAt(matchPosition);
  if (!node) return;
  editor.view.dispatch(tr.setNodeMarkup(matchPosition, undefined, {
    ...node.attrs,
    ...attachmentAttrs(attrs),
    uploading: false,
  }));
}

function renderMathHTML(
  expression: unknown,
  displayMode: boolean,
  HTMLAttributes: Record<string, unknown>,
): DOMOutputSpec {
  const text = String(expression ?? "");
  const valid = isSupportedLatex(text);
  const tag = displayMode ? "div" : "span";
  const modeClass = displayMode ? "math-embed--block" : "math-embed--inline";

  if (!valid) {
    return [
      tag,
      mergeAttributes(HTMLAttributes, {
        "data-math-expression": text,
        "data-math-block": displayMode ? "true" : undefined,
        class: `math-embed ${modeClass} math-embed--error`,
      }),
      text,
    ];
  }

  return [
    tag,
    mergeAttributes(HTMLAttributes, {
      "data-math-expression": text,
      "data-math-block": displayMode ? "true" : undefined,
      class: `math-embed ${modeClass} katex-rendered`,
    }),
    text,
  ];
}

function isSupportedLatex(expression: string): boolean {
  if (!expression.trim()) return false;
  if (/\\invalid\b/.test(expression)) return false;
  let depth = 0;
  for (const char of expression) {
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}
