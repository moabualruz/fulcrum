import { c, type Renderer } from "../renderer.ts";

export const BOOT_SPLASH_TITLE = "Fulcrum TUI";
export const BOOT_SPLASH_SUBTITLE = "Booting local-first agent OS";

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
