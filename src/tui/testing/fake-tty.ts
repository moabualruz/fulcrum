/**
 * FakeTTY — headless terminal driver for TUI tests.
 *
 * Captures all output written via TuiOutput.write() and supports injecting
 * synthetic keypress events. Tests use FakeTTY to run TUI components without
 * a real TTY or interactive session.
 *
 * Usage:
 *   const tty = new FakeTTY();
 *   const app = new TuiApp({ output: tty, ... });
 *   tty.inject('j');           // press 'j'
 *   tty.inject('\r');          // press Enter
 *   const rendered = tty.plainText(); // ANSI-stripped output
 */

import { EventEmitter } from "node:events";

// ─────────────────────────────────────────────────────────────────────────────
// TuiOutput interface — satisfied by both FakeTTY and real stdout wrapper
// ─────────────────────────────────────────────────────────────────────────────

export interface TuiOutput {
  write(data: string): void;
  isTTY: boolean;
  columns: number;
  rows: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// TuiInput interface — satisfied by both FakeTTY and real stdin
// ─────────────────────────────────────────────────────────────────────────────

export interface TuiInput {
  on(event: "keypress", listener: (key: string) => void): this;
  off(event: "keypress", listener: (key: string) => void): this;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANSI escape code stripper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip ANSI colour/cursor escape sequences from a string.
 * Used in tests for snapshot comparisons (content without colour codes).
 */
export function stripAnsi(str: string): string {
  // Covers CSI sequences (\x1b[...m), OSC, and simple \x1b[...
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b(?:\[[0-9;]*[a-zA-Z]|\][^\x07]*\x07|[^[O])/g, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// FakeTTY
// ─────────────────────────────────────────────────────────────────────────────

export class FakeTTY extends EventEmitter implements TuiOutput, TuiInput {
  /** All data written to this FakeTTY, in order. */
  readonly chunks: string[] = [];

  readonly isTTY = true;
  readonly columns: number;
  readonly rows: number;

  constructor(opts: { columns?: number; rows?: number } = {}) {
    super();
    this.columns = opts.columns ?? 80;
    this.rows = opts.rows ?? 24;
  }

  /** Write output (called by TUI renderer). */
  write(data: string): void {
    this.chunks.push(data);
  }

  /**
   * Inject a synthetic keypress into the TUI.
   * Triggers any registered "keypress" listeners.
   */
  inject(key: string): void {
    this.emit("keypress", key);
  }

  /** Full raw output joined. */
  raw(): string {
    return this.chunks.join("");
  }

  /** Output with ANSI escapes stripped — use for content assertions. */
  plainText(): string {
    return stripAnsi(this.raw());
  }

  /** Clear all accumulated output. */
  clear(): void {
    this.chunks.length = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Real stdout adapter (production)
// ─────────────────────────────────────────────────────────────────────────────

export class StdoutOutput implements TuiOutput {
  get isTTY(): boolean {
    return process.stdout.isTTY ?? false;
  }
  get columns(): number {
    return process.stdout.columns ?? 80;
  }
  get rows(): number {
    return process.stdout.rows ?? 24;
  }
  write(data: string): void {
    process.stdout.write(data);
  }
}
