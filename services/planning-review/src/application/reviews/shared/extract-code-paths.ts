import {
  CODE_PATH_BARE_REGEX,
  isCodeFilePath,
  isCodeFilePathStrict,
} from "@planning-review/application/reviews/shared/code-file-paths.ts";

const FENCED_CODE_BLOCK = /(^|\n)([ \t]*)(```|~~~)[\s\S]*?\n\2\3/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const URL_REGEX = /https?:\/\/[^\s<>"']+/g;
const BACKTICK_SPAN = /`([^`\n]+)`/g;

/**
 * Extract candidate code-file paths from markdown text. Mirrors review workbench's renderer
 * detection precedence so validation sees paths the renderer would linkify:
 * fenced code blocks and comments are stripped; URL ranges win over bare-prose paths;
 * backtick spans are collected; strict bare-prose paths are collected and deduped.
 */
export function extractCandidateCodePaths(markdown: string): string[] {
  const stripped = markdown
    .replace(FENCED_CODE_BLOCK, "")
    .replace(HTML_COMMENT, "");

  const candidates = new Set<string>();

  let match: RegExpExecArray | null;
  const backtickRe = new RegExp(BACKTICK_SPAN.source, "g");
  while ((match = backtickRe.exec(stripped)) !== null) {
    const inner = (match[1] ?? "").trim();
    if (isCodeFilePath(inner)) {
      candidates.add(inner.replace(/#.*$/, ""));
    }
  }

  for (const line of stripped.split("\n")) {
    const urlRanges: Array<[number, number]> = [];
    const urlRe = new RegExp(URL_REGEX.source, "g");
    while ((match = urlRe.exec(line)) !== null) {
      urlRanges.push([match.index, match.index + match[0].length]);
    }

    const pathRe = new RegExp(CODE_PATH_BARE_REGEX.source, "g");
    while ((match = pathRe.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const prev = start === 0 ? "" : (line[start - 1] ?? "");
      if (/\w/.test(prev)) continue;

      const overlapsUrl = urlRanges.some(([rangeStart, rangeEnd]) =>
        start < rangeEnd && end > rangeStart
      );
      if (overlapsUrl) continue;
      if (!isCodeFilePathStrict(match[0])) continue;

      candidates.add(match[0].replace(/#.*$/, ""));
    }
  }

  return Array.from(candidates);
}
