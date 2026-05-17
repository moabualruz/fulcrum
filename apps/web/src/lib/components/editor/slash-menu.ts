import type { Editor, Extension, JSONContent } from "@tiptap/core";
import { Node } from "@tiptap/core";
import { TaskItem } from "@tiptap/extension-list/task-item";
import { TaskList } from "@tiptap/extension-list/task-list";
import { StarterKit } from "@tiptap/starter-kit";
import { ExcalidrawNode, FileAttachmentNode, ImageNode, MathBlockNode, MathNode, MermaidNode } from "./embeds";
import { MentionNode } from "./mention";
import { WikilinkNode } from "./wikilink";

export type SlashMenuItem = {
  id: string;
  label: string;
  aliases: string[];
};

export type AutosaveScheduler = (content: JSONContent, bodyMd?: string) => void;

export const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  { id: "paragraph", label: "Paragraph", aliases: ["text", "plain"] },
  { id: "heading-1", label: "Heading 1", aliases: ["h1", "title"] },
  { id: "heading-2", label: "Heading 2", aliases: ["h2", "subtitle"] },
  { id: "heading-3", label: "Heading 3", aliases: ["h3"] },
  { id: "heading-4", label: "Heading 4", aliases: ["h4"] },
  { id: "heading-5", label: "Heading 5", aliases: ["h5"] },
  { id: "heading-6", label: "Heading 6", aliases: ["h6"] },
  { id: "bullet-list", label: "Bullet list", aliases: ["ul", "unordered"] },
  { id: "ordered-list", label: "Ordered list", aliases: ["ol", "numbered"] },
  { id: "task-list", label: "Task list", aliases: ["check", "checklist", "todo"] },
  { id: "blockquote", label: "Quote", aliases: ["quote", "blockquote"] },
  { id: "code-block", label: "Code block", aliases: ["code", "pre"] },
  { id: "table", label: "Table", aliases: ["grid", "cells"] },
  { id: "horizontal-rule", label: "Divider", aliases: ["hr", "rule", "line"] },
  { id: "template", label: "Template section", aliases: ["template", "section"] },
  { id: "wikilink", label: "Wiki link", aliases: ["wiki", "link", "[["] },
  { id: "math", label: "Math", aliases: ["latex", "katex", "$"] },
  { id: "math-block", label: "Math block", aliases: ["latex-block", "katex-block", "$$"] },
  { id: "mermaid", label: "Mermaid diagram", aliases: ["diagram", "flowchart"] },
  { id: "sketch", label: "Sketch", aliases: ["excalidraw", "drawing"] },
  { id: "file", label: "File attachment", aliases: ["attachment", "upload"] },
  { id: "callout", label: "Callout", aliases: ["info", "warning", "tip", "note", "alert"] },
  { id: "details", label: "Toggle / Details", aliases: ["collapse", "accordion", "expand", "spoiler"] },
  { id: "columns", label: "Columns", aliases: ["multi-column", "layout", "side-by-side"] },
  { id: "embed", label: "Embed", aliases: ["youtube", "figma", "loom", "iframe", "video"] },
  { id: "status", label: "Status badge", aliases: ["badge", "tag", "chip"] },
];

export const TableCell = Node.create({
  name: "tableCell",
  content: "block+",
  isolating: true,
  parseHTML: () => [{ tag: "td" }],
  renderHTML: ({ HTMLAttributes }) => ["td", HTMLAttributes, 0],
});

export const TableRow = Node.create({
  name: "tableRow",
  content: "tableCell+",
  parseHTML: () => [{ tag: "tr" }],
  renderHTML: ({ HTMLAttributes }) => ["tr", HTMLAttributes, 0],
});

export const Table = Node.create({
  name: "table",
  group: "block",
  content: "tableRow+",
  isolating: true,
  parseHTML: () => [{ tag: "table" }],
  renderHTML: ({ HTMLAttributes }) => ["table", HTMLAttributes, ["tbody", 0]],
});

export const NarrationBlockNode = Node.create({
  name: "narration-block",
  group: "block",
  atom: true,
  selectable: false,
  addAttributes: () => ({
    readonly: { default: true },
    text: { default: "" },
  }),
  parseHTML: () => [{ tag: "aside[data-narration-block]" }],
  renderHTML: ({ node }) => [
    "aside",
    {
      "data-narration-block": "true",
      "contenteditable": "false",
      class: "narration-block",
    },
    String(node.attrs.text ?? ""),
  ],
});

export const CalloutNode = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes: () => ({
    type: { default: "info" },
  }),
  parseHTML: () => [{ tag: "div[data-callout]" }],
  renderHTML: ({ node, HTMLAttributes }) => [
    "div",
    { ...HTMLAttributes, "data-callout": node.attrs.type, class: `callout callout--${node.attrs.type}` },
    0,
  ],
});

export const DetailsNode = Node.create({
  name: "details",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes: () => ({
    summary: { default: "Toggle" },
    open: { default: false },
  }),
  parseHTML: () => [{ tag: "details" }],
  renderHTML: ({ node, HTMLAttributes }) => [
    "details",
    { ...HTMLAttributes, open: node.attrs.open || undefined },
    ["summary", {}, node.attrs.summary ?? "Toggle"],
    ["div", { class: "details-content" }, 0],
  ],
});

export const ColumnBlockNode = Node.create({
  name: "columnBlock",
  group: "block",
  content: "column+",
  isolating: true,
  parseHTML: () => [{ tag: "div[data-columns]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    { ...HTMLAttributes, "data-columns": "true", class: "columns-layout" },
    0,
  ],
});

export const ColumnNode = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  parseHTML: () => [{ tag: "div[data-column]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    { ...HTMLAttributes, "data-column": "true", class: "column" },
    0,
  ],
});

export const EmbedNode = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  addAttributes: () => ({
    src: { default: "" },
    provider: { default: "generic" },
    title: { default: "" },
    width: { default: "100%" },
    height: { default: "400" },
  }),
  parseHTML: () => [{ tag: "div[data-embed]" }],
  renderHTML: ({ node }) => [
    "div",
    { "data-embed": node.attrs.provider, class: "embed-wrapper" },
    ["iframe", {
      src: node.attrs.src,
      title: node.attrs.title || "Embedded content",
      width: node.attrs.width,
      height: node.attrs.height,
      frameborder: "0",
      allowfullscreen: "true",
      loading: "lazy",
    }],
  ],
});

export const StatusNode = Node.create({
  name: "status",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({
    label: { default: "In Progress" },
    color: { default: "blue" },
  }),
  parseHTML: () => [{ tag: "span[data-status]" }],
  renderHTML: ({ node }) => [
    "span",
    {
      "data-status": node.attrs.color,
      class: `status-badge status-badge--${node.attrs.color}`,
    },
    node.attrs.label,
  ],
});

export function getSlashMenuItems(): SlashMenuItem[] {
  return SLASH_MENU_ITEMS;
}

export function filterSlashMenuItems(items: SlashMenuItem[], query: string): SlashMenuItem[] {
  const normalizedQuery = query.trim().toLowerCase().replace(/^\//, "");
  if (!normalizedQuery) return items;

  return items.filter((item) => {
    const haystack = [item.id, item.label, ...item.aliases].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function createDocEditorExtensions(): Extension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: {
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    MentionNode,
    WikilinkNode,
    MathNode,
    MathBlockNode,
    MermaidNode,
    ExcalidrawNode,
    ImageNode,
    FileAttachmentNode,
    NarrationBlockNode,
    Table,
    TableRow,
    TableCell,
    CalloutNode,
    DetailsNode,
    ColumnBlockNode,
    ColumnNode,
    EmbedNode,
    StatusNode,
  ] as Extension[];
}

export function insertSlashMenuItem(editor: Editor, itemId: string): boolean {
  deleteSlashQuery(editor);
  const chain = editor.chain().focus();

  if (itemId.startsWith("heading-")) {
    const level = Number(itemId.replace("heading-", ""));
    return editor.chain().focus().setNode("heading", { level }).run();
  }

  switch (itemId) {
    case "paragraph":
      return chain.setParagraph().run();
    case "bullet-list":
      return chain.toggleBulletList().run();
    case "ordered-list":
      return chain.toggleOrderedList().run();
    case "task-list":
      return chain.toggleTaskList().run();
    case "blockquote":
      return chain.toggleBlockquote().run();
    case "code-block":
      return chain.toggleCodeBlock().run();
    case "horizontal-rule":
      return chain.setHorizontalRule().run();
    case "table":
      return chain.insertContent(tableContent()).run();
    case "template":
      return chain.insertContent({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Template section" }],
      }).run();
    case "wikilink":
      return chain.insertContent({ type: "wikilink", attrs: { slug: "doc-title", resolved: false } }).run();
    case "math":
      return chain.insertContent({ type: "math", attrs: { expression: "E=mc^2", displayMode: false } }).run();
    case "math-block":
      return chain.insertContent({ type: "mathBlock", attrs: { expression: "E=mc^2", displayMode: true } }).run();
    case "mermaid":
      return chain.insertContent({
        type: "mermaid",
        attrs: { diagram: "graph TD;\n  A[Start] --> B[Next]" },
      }).run();
    case "sketch":
      return chain.insertContent({ type: "excalidraw" }).run();
    case "file":
      return chain.insertContent({ type: "fileAttachment", attrs: { uploading: true } }).run();
    case "callout":
      return chain.insertContent({
        type: "callout",
        attrs: { type: "info" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Callout text" }] }],
      }).run();
    case "details":
      return chain.insertContent({
        type: "details",
        attrs: { summary: "Click to expand", open: false },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Hidden content" }] }],
      }).run();
    case "columns":
      return chain.insertContent({
        type: "columnBlock",
        content: [
          { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "Column 1" }] }] },
          { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "Column 2" }] }] },
        ],
      }).run();
    case "embed": {
      const src = typeof window !== "undefined" ? window.prompt("Embed URL (YouTube, Figma, etc.)") : null;
      if (!src) return false;
      return chain.insertContent({ type: "embed", attrs: { src, provider: detectProvider(src) } }).run();
    }
    case "status":
      return chain.insertContent({ type: "status", attrs: { label: "In Progress", color: "blue" } }).run();
    default:
      return false;
  }
}

export function insertTemplateBody(editor: Editor, bodyTemplate: string): boolean {
  if (!bodyTemplate.trim()) return false;
  return editor.chain().focus().insertContent(bodyTemplate).run();
}

export function createAutosaveScheduler(options: {
  delayMs?: number;
  save: (contentJson: JSONContent, bodyMd?: string) => Promise<void> | void;
}): AutosaveScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (contentJson: JSONContent, bodyMd?: string) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void options.save(contentJson, bodyMd);
    }, options.delayMs ?? 2000);
  };
}

function deleteSlashQuery(editor: Editor): void {
  const { state } = editor;
  const { from } = state.selection;
  const blockStart = state.selection.$from.start();
  const textBefore = state.doc.textBetween(blockStart, from, "\n", "\n");
  const slashIndex = textBefore.lastIndexOf("/");
  if (slashIndex === -1) return;

  editor.commands.deleteRange({
    from: blockStart + slashIndex,
    to: from,
  });
}

function detectProvider(url: string): string {
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/figma\.com/.test(url)) return "figma";
  if (/loom\.com/.test(url)) return "loom";
  if (/vimeo\.com/.test(url)) return "vimeo";
  if (/codepen\.io/.test(url)) return "codepen";
  if (/codesandbox\.io/.test(url)) return "codesandbox";
  if (/miro\.com/.test(url)) return "miro";
  if (/airtable\.com/.test(url)) return "airtable";
  return "generic";
}

function tableContent(): JSONContent {
  const cell = (): JSONContent => ({
    type: "tableCell",
    content: [{ type: "paragraph" }],
  });

  return {
    type: "table",
    content: [
      { type: "tableRow", content: [cell(), cell(), cell()] },
      { type: "tableRow", content: [cell(), cell(), cell()] },
      { type: "tableRow", content: [cell(), cell(), cell()] },
    ],
  };
}
