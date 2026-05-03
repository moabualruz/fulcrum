/**
 * wcwidth-aware string truncation for TUI.
 *
 * CJK double-width characters and emoji occupy 2 terminal columns.
 * This module uses the wcwidth npm package to measure visual width
 * and truncate accordingly.
 */

// wcwidth has no default export in its types; use require-style
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wcwidth: (char: string) => number = require("wcwidth");

/** Measure the visual (terminal column) width of a string. */
export function stringWidth(str: string): number {
  let w = 0;
  for (const ch of str) {
    const cw = wcwidth(ch);
    w += cw < 0 ? 0 : cw;
  }
  return w;
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
    const cw = wcwidth(ch);
    const charWidth = cw < 0 ? 0 : cw;
    if (w + charWidth > maxCols - reservedForEllipsis) break;
    result += ch;
    w += charWidth;
  }
  return result + ellipsis;
}
