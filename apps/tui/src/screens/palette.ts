import type { KeyBinding } from "../widgets/HelpOverlay.ts";

export const HELP_TOGGLE_KEY = "?" as const;

export function isHelpToggleKey(key: string): boolean {
  return key === HELP_TOGGLE_KEY;
}

export const FOUNDATION_HELP_BINDINGS: KeyBinding[] = [
  { key: "j/k", action: "Move selection (vim down/up)" },
  { key: "gg / G", action: "Jump to top / bottom" },
  { key: "/", action: "Open command palette" },
  { key: "V", action: "Toggle multi-select" },
  { key: "Enter", action: "Open detail pane" },
  { key: "?", action: "Toggle this help overlay" },
];

const CONTEXT_BINDINGS: Record<string, KeyBinding[]> = {
  capture: [
    { key: "a", action: "Approve current capture" },
    { key: "b", action: "Block current capture" },
    { key: "e", action: "Escalate current capture" },
    { key: "@", action: "Assign current capture" },
  ],
  doctor: [
    { key: "p", action: "Probe selected subsystem" },
    { key: "R", action: "Reload subsystem registry" },
  ],
  runs: [
    { key: "x", action: "Cancel selected run" },
    { key: "r", action: "Retry failed run" },
  ],
};

export function bindingsForContext(contextKey: string | null | undefined): KeyBinding[] {
  if (!contextKey) return FOUNDATION_HELP_BINDINGS;
  const contextual = CONTEXT_BINDINGS[contextKey] ?? [];
  return [...FOUNDATION_HELP_BINDINGS, ...contextual];
}
