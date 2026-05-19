import { c, type Renderer } from "../renderer.ts";
import type { KeyBinding } from "../widgets/HelpOverlay.ts";

export const BOOT_SPLASH_TITLE = "Fulcrum TUI";
export const BOOT_SPLASH_SUBTITLE = "Booting local-first agent OS";
export const SELECTED_ROW_FOCUS_MARKER = ">";
export const FOUNDATION_KEY_BINDINGS = [
  { key: "j/k", action: "Move selection" },
  { key: "Enter/Space", action: "Open selected item or toggle selection" },
  { key: "?", action: "Show or hide help" },
  { key: "Esc", action: "Close help, modal, pane, or return to parent" },
  { key: "q", action: "Exit current screen; from launcher, quit" },
  { key: "t", action: "Toggle dark/light theme" },
] as const satisfies readonly KeyBinding[];

export const TOGGLE_THEME_COMMAND = "Toggle dark mode" as const;

export type FoundationThemePreset = "dark" | "light";

export function nextThemePreset(current: FoundationThemePreset | string | undefined | null): FoundationThemePreset {
  return current === "dark" ? "light" : "dark";
}

function centered(line: string, width: number): string {
  if (width <= line.length) return line;
  return `${" ".repeat(Math.floor((width - line.length) / 2))}${line}`;
}

export function renderBootSplash(renderer: Renderer): void {
  renderer.clearScreen();
  renderer.hideCursor();
  renderer.writeln();
  renderer.writeln(centered(c.bold(BOOT_SPLASH_TITLE), renderer.width));
  renderer.writeln(centered(c.dim(BOOT_SPLASH_SUBTITLE), renderer.width));
}

export function formatFocusedRowLabel(label: string, selected: boolean): string {
  return selected ? `${SELECTED_ROW_FOCUS_MARKER} ${c.bold(label)}` : `  ${label}`;
}
