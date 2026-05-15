export const SAFE_DOC_ELEMENTS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "iframe",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
] as const;

const SAFE_TAGS = new Set<string>(SAFE_DOC_ELEMENTS);
const VOID_TAGS = new Set(["br", "img"]);
const URL_ATTRIBUTES = new Set(["href", "src"]);
const GLOBAL_ATTRIBUTES = new Set(["class", "id", "title", "aria-label", "role"]);
const TAG_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
  code: new Set(["class"]),
  iframe: new Set(["sandbox", "src", "title"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  span: new Set(["class", "data-math-expression"]),
};

type JsonRecord = Record<string, unknown>;

export function sanitizeDocHtml(html: string): string {
  let input = stripDangerousRawTextElements(html);
  input = input.replace(/<!--[\s\S]*?-->/g, "");

  return input.replace(/<\/?([a-zA-Z][\w:-]*)([^<>]*)>/g, (raw, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    const closing = raw.startsWith("</");

    if (!SAFE_TAGS.has(tag)) return "";
    if (closing) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;

    const attrs = sanitizeAttributes(tag, rawAttrs ?? "");
    if (tag === "iframe" && !attrs.some((attr) => attr.startsWith("sandbox="))) return "";

    return `<${tag}${attrs.length > 0 ? ` ${attrs.join(" ")}` : ""}>`;
  });
}

export function sanitizeDocJsonFields<T>(value: T): T {
  if (typeof value === "string") return sanitizeJsonString(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeDocJsonFields(item)) as T;
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    return Object.fromEntries(
      Object.entries(record).map(([key, nested]) => [key, sanitizeDocJsonFields(nested)]),
    ) as T;
  }
  return value;
}

export async function renderDocToHtml(bodyMd: string): Promise<string> {
  return sanitizeDocHtml(renderMarkdown(bodyMd));
}

function stripDangerousRawTextElements(html: string): string {
  let current = html;
  let previous = "";
  while (current !== previous) {
    previous = current;
    current = current.replace(/<\s*(script|style|iframe)\b(?![^>]*\bsandbox\s*=)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
    current = current.replace(/<\s*(script|style)\b[^>]*\/?\s*>/gi, "");
  }
  return current;
}

function sanitizeAttributes(tag: string, rawAttrs: string): string[] {
  const allowed = new Set([...(TAG_ATTRIBUTES[tag] ?? new Set<string>()), ...GLOBAL_ATTRIBUTES]);
  const attrs: string[] = [];
  const seen = new Set<string>();
  const attrPattern = /([^\s"'<>/=]+)\s*=\s*(["'])(.*?)\2/g;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(rawAttrs)) !== null) {
    const name = match[1]?.toLowerCase() ?? "";
    const value = match[3] ?? "";
    if (!name || seen.has(name) || name.startsWith("on") || !allowed.has(name)) continue;
    if (URL_ATTRIBUTES.has(name) && !isSafeUrl(value)) continue;

    seen.add(name);
    attrs.push(`${name}="${escapeAttribute(value)}"`);
  }

  return attrs;
}

function sanitizeJsonString(value: string): string {
  if (looksLikeDangerousUrl(value)) return "";
  return sanitizeDocHtml(value);
}

function isSafeUrl(value: string): boolean {
  const trimmed = decodeHtmlEntities(value).trim().replace(/[\u0000-\u001f\u007f\s]+/g, "");
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return true;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return /^(https?|mailto):/i.test(trimmed);
  return true;
}

function looksLikeDangerousUrl(value: string): boolean {
  const normalized = decodeHtmlEntities(value).trim().replace(/[\u0000-\u001f\u007f\s]+/g, "");
  return /^[a-z][a-z0-9+.-]*:/i.test(normalized) && !/^(https?|mailto):/i.test(normalized);
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.trim().split(/\r?\n/);
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let code: { lang: string; lines: string[] } | null = null;

  function flushParagraph(): void {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  for (const line of lines) {
    const fence = line.match(/^```([A-Za-z0-9_-]+)?\s*$/);
    if (fence && code === null) {
      flushParagraph();
      code = { lang: fence[1] ?? "", lines: [] };
      continue;
    }
    if (fence && code !== null) {
      blocks.push(renderCodeBlock(code.lang, code.lines.join("\n")));
      code = null;
      continue;
    }
    if (code !== null) {
      code.lines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1]?.length ?? 1;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2] ?? "")}</h${level}>`);
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    paragraph.push(line.trim());
  }

  flushParagraph();
  if (code !== null) blocks.push(renderCodeBlock(code.lang, code.lines.join("\n")));
  return blocks.join("\n");
}

function renderInlineMarkdown(value: string): string {
  const escaped = escapeHtml(value);
  return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    return `<a href="${escapeAttribute(href)}">${label}</a>`;
  });
}

function renderCodeBlock(lang: string, source: string): string {
  const className = lang ? ` class="language-${escapeAttribute(lang)}"` : "";
  const highlighted = escapeHtml(source).replace(/\b(const|let|var|function|return|type|interface)\b/g, '<span class="token keyword">$1</span>');
  return `<pre><code${className}>${highlighted}</code></pre>`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);?/g, (_match, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&colon;?/gi, ":")
    .replace(/&Tab;?/g, "\t")
    .replace(/&NewLine;?/g, "\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
