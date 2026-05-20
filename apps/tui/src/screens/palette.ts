/**
 * ColonPalette help bindings — the keyboard map shown in the help overlay.
 *
 * Two command surfaces, per CLI-TUI-UX.md §7.1 + §9 (apps/tui/CONTEXT.md
 * ColonPalette):
 *   - `:` opens the **ColonPalette** — the modal, text-driven command palette
 *     with k9s/Helix grammar that tab-completes against the CLI command tree.
 *   - `/` filters the *current* screen (in-screen search), it is NOT the
 *     command palette. The legacy wording that called `/` "command palette"
 *     was a copy bug — agent-tui-review.md Critical finding 3 names it.
 *
 * This module also publishes the StageChord cheatsheet rows (`g c`/`g p`/…)
 * so the help overlay renders the canonical CLI-TUI-UX.md §7.2 navigation map
 * rather than placeholder text.
 */
import type { KeyBinding } from "../widgets/HelpOverlay.ts";
import { STAGE_CHORDS } from "../keybindings.ts";

export const HELP_TOGGLE_KEY = "?" as const;

export function isHelpToggleKey(key: string): boolean {
  return key === HELP_TOGGLE_KEY;
}

/**
 * The foundation help bindings every screen shows. Key column is stable
 * (`j/k`, `gg / G`, `/`, `V`, `Enter`, `?`); the `/` row's action is
 * "Search/filter current screen" — `/` is in-screen search, not the palette
 * (CLI-TUI-UX.md §7.1). The ColonPalette is the separate `:` surface; see
 * {@link COMMAND_SURFACE_BINDINGS}.
 */
export const FOUNDATION_HELP_BINDINGS: KeyBinding[] = [
  { key: "j/k", action: "Move selection (vim down/up)" },
  { key: "gg / G", action: "Jump to top / bottom" },
  { key: "/", action: "Search/filter current screen" },
  { key: "V", action: "Toggle multi-select" },
  { key: "Enter", action: "Open detail pane" },
  { key: "?", action: "Toggle this help overlay" },
];

/**
 * The command-surface bindings — `:` opens the ColonPalette, `Space` opens the
 * SpaceMenu (CLI-TUI-UX.md §7.1, §9). Distinct from `/` in-screen search.
 */
export const COMMAND_SURFACE_BINDINGS: KeyBinding[] = [
  { key: ":", action: "Open command palette (CLI grammar)" },
  { key: "Space", action: "Open menu (frecency-ranked)" },
  { key: "Esc", action: "Cancel palette / input" },
];

/**
 * The StageChord cheatsheet (CLI-TUI-UX.md §7.2). Each row is `g <key>` →
 * stage screen. Order matches OD `tui-runs.html` help panel: Capture, Plan,
 * Build runs, Build board, Review, Ship, Operate. `g B` is a distinct row
 * from `g b` — uppercase opens the board, lowercase the runs feed.
 */
export const STAGE_CHORD_BINDINGS: KeyBinding[] = [
  { key: "g c", action: "Go to Capture" },
  { key: "g p", action: "Go to Plan" },
  { key: "g b", action: "Go to Build (runs feed)" },
  { key: "g B", action: "Go to Build · board view" },
  { key: "g r", action: "Go to Review" },
  { key: "g s", action: "Go to Ship" },
  { key: "g o", action: "Go to Operate / doctor" },
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

/**
 * The full help-overlay map: foundation list/search keys, then the command
 * surfaces (`:` ColonPalette / `Space` menu), then the StageChord navigation
 * cheatsheet. This is the OD `tui-runs.html` "? keyboard cheatsheet" content —
 * `bindingsForContext()` stays the per-screen subset, this is the global map.
 */
export function helpCheatsheetBindings(
  contextKey?: string | null,
): KeyBinding[] {
  return [
    ...bindingsForContext(contextKey),
    ...COMMAND_SURFACE_BINDINGS,
    ...STAGE_CHORD_BINDINGS,
  ];
}

/**
 * Assert the StageChord cheatsheet covers exactly the `keybindings.ts`
 * `STAGE_CHORDS` map — one help row per chord second key, no drift. Returns
 * `true` when the help cheatsheet and the chord state machine agree.
 */
export function stageChordBindingsCoverChordMap(): boolean {
  const chordKeys = Object.keys(STAGE_CHORDS).sort();
  const bindingKeys = STAGE_CHORD_BINDINGS.map((b) => b.key.replace(/^g /, "")).sort();
  if (chordKeys.length !== bindingKeys.length) return false;
  return chordKeys.every((k, i) => k === bindingKeys[i]);
}
