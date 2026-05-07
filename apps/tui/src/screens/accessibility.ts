import { Renderer } from "../renderer.ts";

export const ACCESSIBLE_STATUS_LABELS = ["error", "warning", "success", "muted", "active"] as const;

export function renderFocusableRow(renderer: Renderer, label: string, focused: boolean): void {
  renderer.writeln(`${focused ? "> focused" : "  idle"} ${label}`);
}

export function renderHighContrastLegend(renderer: Renderer): void {
  renderer.header("High contrast");
  renderer.infoRow("Theme", "High contrast");
  renderer.infoRow("Keyboard", "enabled");
  for (const label of ACCESSIBLE_STATUS_LABELS) {
    renderer.infoRow(label, label === "muted" ? "disabled" : "enabled");
  }
}
