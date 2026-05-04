/**
 * HelpOverlay — renders keybinding map for current screen context.
 * Triggered by `?` key.
 */

import pc from "picocolors";

export interface KeyBinding {
  key: string;
  action: string;
}

export interface HelpOverlayOpts {
  screenName: string;
  bindings: KeyBinding[];
  width: number;
}

export class HelpOverlay {
  private readonly screenName: string;
  private readonly bindings: KeyBinding[];
  private readonly width: number;

  constructor(opts: HelpOverlayOpts) {
    this.screenName = opts.screenName;
    this.bindings = opts.bindings;
    this.width = opts.width;
  }

  render(): string[] {
    const lines: string[] = [];
    const inner = this.width - 4;

    lines.push("┌" + "─".repeat(inner + 2) + "┐");
    lines.push("│ " + pc.bold(`${this.screenName} — Keybindings`).padEnd(inner) + " │");
    lines.push("│" + "─".repeat(inner + 2) + "│");

    for (const b of this.bindings) {
      const keyStr = pc.cyan(b.key.padEnd(8));
      const text = `  ${keyStr}  ${b.action}`;
      lines.push("│ " + text.padEnd(inner) + " │");
    }

    lines.push("│" + " ".repeat(inner + 2) + "│");
    lines.push("│ " + pc.dim("Press ? or Esc to close").padEnd(inner) + " │");
    lines.push("└" + "─".repeat(inner + 2) + "┘");

    return lines;
  }
}
