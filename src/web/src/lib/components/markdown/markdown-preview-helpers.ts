// Pure helper: marked → DOMPurify. Server-safe via isomorphic-dompurify, so
// the same code runs in SSR, browser, and bun:test (no DOM globals required).
import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

export function renderMarkdownToHtml(input: string): string {
  if (!input) return "";
  const rawHtml = marked.parse(input, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml);
}
