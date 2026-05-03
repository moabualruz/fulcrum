import type { JSONContent } from "@tiptap/core";

export interface MentionTarget {
  id: string;
  label: string;
  kind: "user" | "agent";
}

export interface WikilinkToken {
  slug: string;
  status: "resolved" | "missing";
  docId: string | null;
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

export function extractWikilinkSlugs(content: JSONContent): string[] {
  return [...new Set(extractPlainText(content).match(WIKILINK_RE)?.map((link) => link.slice(2, -2).trim()).filter(Boolean) ?? [])];
}

export function extractMentionLabels(content: JSONContent): string[] {
  return [...new Set(extractPlainText(content).match(/(^|\s)@[\w-]+/g)?.map((mention) => mention.trim().slice(1)).filter(Boolean) ?? [])];
}

export function extractPlainText(node: JSONContent | null | undefined): string {
  if (!node) return "";
  const parts: string[] = [];
  function visit(current: JSONContent): void {
    if (typeof current.text === "string") parts.push(current.text);
    for (const child of current.content ?? []) visit(child);
    if (current.type === "paragraph" || current.type === "heading" || current.type === "listItem") {
      parts.push("\n");
    }
  }
  visit(node);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export function textToTipTapDoc(text: string): JSONContent {
  const paragraphs = text.split(/\r?\n/);
  return {
    type: "doc",
    content: paragraphs.length === 0
      ? [{ type: "paragraph" }]
      : paragraphs.map((paragraph) => ({
        type: "paragraph",
        content: paragraph.length > 0 ? [{ type: "text", text: paragraph }] : undefined,
      })),
  };
}

export function sameJson(a: JSONContent, b: JSONContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
