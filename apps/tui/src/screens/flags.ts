/**
 * TUI Feature Flags screen: Settings → Feature Flags
 *
 * Renders all registered flags as a toggleable list with descriptions.
 * Toggle calls flags.set in-process; re-queries flags.list after each toggle.
 *
 * Keybindings:
 *   - j / ↓   → move cursor down
 *   - k / ↑   → move cursor up
 *   - Space / Enter → toggle selected flag
 *   - q       → exit screen
 *
 * Design: headless-testable. Data and tRPC caller are injected via FlagsScreenOptions.
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FlagItem {
  name: string;
  enabled: boolean;
  description: string;
}

export interface FlagsScreenOptions {
  /** In-process tRPC caller or equivalent: must expose flags.list and flags.set. */
  caller: {
    flags: {
      list: () => Promise<FlagItem[]>;
      set: (input: { flag: string; enabled: boolean }) => Promise<{ ok: boolean }>;
    };
  };
  onExit?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// FlagsScreen
// ─────────────────────────────────────────────────────────────────────────────

export class FlagsScreen {
  private flags: FlagItem[] = [];
  private cursor = 0;

  constructor(
    private readonly renderer: Renderer,
    private readonly opts: FlagsScreenOptions,
  ) {}

  /**
   * Load flags from the in-process tRPC caller.
   * Must be called before the first render().
   */
  async load(): Promise<void> {
    this.flags = await this.opts.caller.flags.list();
    this.cursor = Math.min(this.cursor, Math.max(0, this.flags.length - 1));
  }

  /** Render the flags screen. */
  render(): void {
    const r = this.renderer;

    r.writeln();
    r.writeln(c.bold("  Settings › Feature Flags"));
    r.separator();
    r.writeln();

    if (this.flags.length === 0) {
      r.writeln(c.dim("  No feature flags registered."));
    } else {
      for (let i = 0; i < this.flags.length; i++) {
        const flag = this.flags[i];
        if (!flag) continue;
        r.flagItem(flag.name, flag.enabled, flag.description, i === this.cursor);
      }
    }

    r.writeln();
    r.writeln(c.dim("  j/k navigate  Space/Enter toggle  q back"));
  }

  /**
   * Handle a keypress event.
   * Returns true if the key was consumed; false if caller should handle it.
   *
   * Note: toggle is async: the caller must await handleKeyAsync() to let
   * flags.set + flags.list complete before re-rendering.
   */
  async handleKey(key: string): Promise<boolean> {
    if (key === "q" || key === "\x1b") {
      this.opts.onExit?.();
      return true;
    }

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.flags.length - 1));
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(this.cursor - 1, 0);
      return true;
    }

    if (key === " " || key === "\r" || key === "\n") {
      await this._toggleCurrent();
      return true;
    }

    return false;
  }

  /** Toggle the currently selected flag. */
  private async _toggleCurrent(): Promise<void> {
    const flag = this.flags[this.cursor];
    if (!flag) return;

    const newEnabled = !flag.enabled;
    await this.opts.caller.flags.set({ flag: flag.name, enabled: newEnabled });
    // Re-query to reflect DB state (may differ from optimistic toggle)
    await this.load();
  }

  /** Current cursor position (for testing). */
  get cursorIndex(): number {
    return this.cursor;
  }

  /** Current flags list (for testing). */
  get currentFlags(): readonly FlagItem[] {
    return this.flags;
  }
}
