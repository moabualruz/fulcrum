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
    Table,
    TableRow,
    TableCell,
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
