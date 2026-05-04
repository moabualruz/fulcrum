/**
 * wcwidth-aware string truncation for TUI.
 *
 * CJK double-width characters and emoji occupy 2 terminal columns.
 * This module keeps the width rules local so the TUI does not need a runtime
 * package for tests or the compiled binary.
 */

/** Measure the visual (terminal column) width of a string. */
export function stringWidth(str: string): number {
  let w = 0;
  for (const ch of str) {
    w += charWidth(ch);
  }
  return w;
}

function charWidth(ch: string): number {
  const code = ch.codePointAt(0);
  if (code === undefined) return 0;
  if (code === 0) return 0;
  if (code < 32 || (code >= 0x7f && code < 0xa0)) return 0;
  if (
    (code >= 0x1100 && code <= 0x115f)
    || code === 0x2329
    || code === 0x232a
    || (code >= 0x2e80 && code <= 0xa4cf)
    || (code >= 0xac00 && code <= 0xd7a3)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xfe10 && code <= 0xfe19)
    || (code >= 0xfe30 && code <= 0xfe6f)
    || (code >= 0xff00 && code <= 0xff60)
    || (code >= 0xffe0 && code <= 0xffe6)
    || (code >= 0x1f300 && code <= 0x1faff)
  ) {
    return 2;
  }
  return 1;
}

/**
 * Truncate `str` to at most `maxCols` visible terminal columns.
 * Appends "…" (1 col) when truncation occurs.
 *
 * Examples:
 *   truncateWide("中文abc", 6) → "中文a…"   (中=2, 文=2, a=1, …=1 → 6)
 *   truncateWide("hello", 10) → "hello"
 */
export function truncateWide(str: string, maxCols: number): string {
  if (stringWidth(str) <= maxCols) return str;

  let w = 0;
  let result = "";
  const ellipsis = "…"; // 1 column wide
  const reservedForEllipsis = 1;

  for (const ch of str) {
    const width = charWidth(ch);
    if (w + width > maxCols - reservedForEllipsis) break;
    result += ch;
    w += width;
  }
  return result + ellipsis;
}
