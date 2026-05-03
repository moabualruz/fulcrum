import { mergeAttributes, Node } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";

const DEFAULT_MATH = "E=mc^2";
const DEFAULT_MERMAID = "graph TD;\n  A[Start] --> B[Next]";
const EMPTY_SKETCH = btoa(JSON.stringify({ type: "excalidraw", version: 2, source: "fulcrum", elements: [] }));

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
