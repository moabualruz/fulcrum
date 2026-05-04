import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

export function sanitizeDocHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["data-wikilink-chip"],
  });
}

export function renderDocMarkdownToHtml(markdown: string): string {
  const withWikilinks = markdown.replace(/\[\[([^\]]+)\]\]/g, (_match, slug: string) => {
    const safeSlug = encodeURIComponent(String(slug).trim());
    const label = escapeHtml(String(slug).trim());
    return `<a class="wikilink-chip" data-wikilink-chip="${label}" href="/docs/${safeSlug}">${label}</a>`;
  });
  const rawHtml = marked.parse(withWikilinks, { async: false }) as string;
  return sanitizeDocHtml(rawHtml);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
