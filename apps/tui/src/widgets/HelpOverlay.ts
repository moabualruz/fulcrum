/**
 * HelpOverlay: renders keybinding map for current screen context.
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
    const inner = Math.max(8, this.width - 4);

    lines.push("┌" + "─".repeat(inner + 2) + "┐");
    lines.push("│ " + pc.bold(fit(`${this.screenName}: Keybindings`, inner)).padEnd(inner) + " │");
    lines.push("│" + "─".repeat(inner + 2) + "│");

    for (const b of this.bindings) {
      const keyStr = b.key.padEnd(8);
      const text = fit(`  ${keyStr}  ${b.action}`, inner);
      lines.push("│ " + text.padEnd(inner) + " │");
    }

    lines.push("│" + " ".repeat(inner + 2) + "│");
    lines.push("│ " + pc.dim(fit("Press ? or Esc to close", inner)).padEnd(inner) + " │");
    lines.push("└" + "─".repeat(inner + 2) + "┘");

    return lines;
  }
}

function fit(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 1) return value.slice(0, width);
  return value.slice(0, width - 1) + "…";
}
