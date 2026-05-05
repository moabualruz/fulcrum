/**
 * Per-doc_type toolbar configuration for TipTap editor.
 * Keys match the DocType enum in Document entity.
 */

export const TOOLBAR_PRESETS: Record<string, string[]> = {
  spec: ["heading", "bold", "italic", "code", "codeBlock", "math", "mermaid", "table", "link", "wikilink"],
  adr: ["heading", "bold", "italic", "code", "codeBlock", "table", "link"],
  wiki: ["heading", "bold", "italic", "code", "codeBlock", "math", "mermaid", "image", "table", "link", "wikilink"],
  runbook: ["heading", "bold", "italic", "code", "codeBlock", "table", "link", "taskList"],
  meeting: ["heading", "bold", "italic", "taskList", "table", "link"],
  postmortem: ["heading", "bold", "italic", "code", "codeBlock", "table", "link", "timeline"],
  rfc: ["heading", "bold", "italic", "code", "codeBlock", "math", "table", "link", "wikilink"],
  note: ["heading", "bold", "italic", "code", "link", "taskList"],
  scratch: ["bold", "italic", "code", "link"],
};

export type ToolbarItem = (typeof TOOLBAR_PRESETS)[string][number];
