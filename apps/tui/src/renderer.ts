/**
 * TUI renderer utilities: ANSI-based terminal rendering.
 *
 * Uses picocolors for ANSI colour codes. Provides box-drawing, layout, and
 * string-truncation helpers used by all TUI screens.
 *
 * NO_COLOR env support: when process.env.NO_COLOR is set, all colour functions
 * become identity (pass-through), preserving structure via box-drawing chars only.
 */

import pc from "picocolors";
import type { TuiOutput } from "./testing/fake-tty.ts";

// ─────────────────────────────────────────────────────────────────────────────
// NO_COLOR support
// ─────────────────────────────────────────────────────────────────────────────

const noColor = typeof process !== "undefined" && !!process.env["NO_COLOR"];

/** Apply a picocolors transform only when NO_COLOR is not set. */
function color<T extends string>(fn: (s: T) => string, s: T): string {
  return noColor ? s : fn(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Colour helpers (delegates to picocolors, respects NO_COLOR)
// ─────────────────────────────────────────────────────────────────────────────

export const c = {
  bold: (s: string) => color(pc.bold, s),
  dim: (s: string) => color(pc.dim, s),
  green: (s: string) => color(pc.green, s),
  red: (s: string) => color(pc.red, s),
  yellow: (s: string) => color(pc.yellow, s),
  cyan: (s: string) => color(pc.cyan, s),
  blue: (s: string) => color(pc.blue, s),
  magenta: (s: string) => color(pc.magenta, s),
  white: (s: string) => color(pc.white, s),
  bgBlue: (s: string) => color(pc.bgBlue, s),
  bgCyan: (s: string) => color(pc.bgCyan, s),
  inverse: (s: string) => color(pc.inverse, s),
};

// ─────────────────────────────────────────────────────────────────────────────
// ANSI cursor / screen control
// ─────────────────────────────────────────────────────────────────────────────

/** Clear the terminal screen and move cursor to top-left. */
export function clearScreen(): string {
  return "\x1b[2J\x1b[H";
}

/** Move cursor to a given row, column (1-indexed). */
export function moveTo(row: number, col: number): string {
  return `\x1b[${row};${col}H`;
}

/** Hide cursor. */
export function hideCursor(): string {
  return "\x1b[?25l";
}

/** Show cursor. */
export function showCursor(): string {
  return "\x1b[?25h";
}

// ─────────────────────────────────────────────────────────────────────────────
// String utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pad or truncate `str` to exactly `width` visible characters.
 * Uses basic ASCII width (no CJK double-width support at this stage;
 * full wcwidth support added in P1#15-T15-05).
 */
export function pad(str: string, width: number, fillChar = " "): string {
  if (str.length >= width) return str.slice(0, width);
  return str + fillChar.repeat(width - str.length);
}

/** Truncate string to `maxLen` visible characters, adding "…" if truncated. */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

// ─────────────────────────────────────────────────────────────────────────────
// Box-drawing
// ─────────────────────────────────────────────────────────────────────────────

/** Draw a horizontal rule of given width. */
export function hRule(width: number, char = "─"): string {
  return char.repeat(Math.max(0, width));
}

/** Draw a box (top border only, for section headers). */
export function boxTop(width: number): string {
  return "┌" + hRule(width - 2) + "┐";
}
export function boxBottom(width: number): string {
  return "└" + hRule(width - 2) + "┘";
}
export function boxRow(content: string, width: number): string {
  const inner = pad(content, width - 2);
  return "│" + inner + "│";
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderer: writes to a TuiOutput
// ─────────────────────────────────────────────────────────────────────────────

export class Renderer {
  constructor(private readonly out: TuiOutput) {}

  get width(): number {
    return this.out.columns;
  }

  get height(): number {
    return this.out.rows;
  }

  write(s: string): void {
    this.out.write(s);
  }

  writeln(s = ""): void {
    this.out.write(s + "\n");
  }

  clearScreen(): void {
    this.out.write(clearScreen());
  }

  hideCursor(): void {
    this.out.write(hideCursor());
  }

  showCursor(): void {
    this.out.write(showCursor());
  }

  /** Render a full-width header bar. */
  header(title: string): void {
    const bar = pad(` ${title}`, this.width);
    this.writeln(c.inverse(bar));
  }

  /** Render a full-width status bar (bottom). */
  statusBar(left: string, right = ""): void {
    const space = Math.max(0, this.width - left.length - right.length - 2);
    const bar = ` ${left}${" ".repeat(space)}${right} `;
    this.writeln(c.bgBlue(c.white(pad(bar, this.width))));
  }

  /** Render a navigation item (highlighted if selected). */
  navItem(label: string, selected: boolean): void {
    const line = pad(`  ${label}`, this.width);
    this.writeln(selected ? c.inverse(line) : line);
  }

  /** Render a horizontal separator. */
  separator(char = "─"): void {
    this.writeln(c.dim(hRule(this.width, char)));
  }

  /** Render a key→value info row. */
  infoRow(key: string, value: string, keyWidth = 20): void {
    this.writeln(`  ${c.bold(pad(key + ":", keyWidth))}  ${value}`);
  }

  /** Render a toggleable list item (for flags screen). */
  flagItem(name: string, enabled: boolean, description: string, selected: boolean): void {
    const toggle = enabled ? c.green("[ON ]") : c.dim("[OFF]");
    const nameStr = c.bold(pad(name, 30));
    const desc = truncate(description, this.width - 42);
    const line = `  ${toggle}  ${nameStr}  ${c.dim(desc)}`;
    this.writeln(selected ? c.inverse(pad(line, this.width)) : line);
  }
}
