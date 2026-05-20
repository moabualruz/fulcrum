/**
 * ModePicker — the TUI per-Step mode affordance row (DESIGN.md §4.11, §4.13;
 * CLI-TUI-UX.md §7.4).
 *
 * Every Step in the web shell carries the `✋ Manual / ▶ Play / 💬 Discuss /
 * ⊞ AI Assist` ModeAffordance row. `prd-web-mode-affordance-system` makes that
 * affordance universal across surfaces; this widget is the TUI equivalent — the
 * compact mode row rendered on a focused Step, mirroring the OD `.mode-row
 * compact` form (icon glyphs, no labels) and exposing the four modes through
 * the canonical CLI-TUI-UX §7.4 keybindings.
 *
 * Keybindings (CLI-TUI-UX §7.4 + DESIGN.md §4.11, per focused Step):
 *   a   ✋ Manual    — work the step yourself (also `h`, the leftmost mode)
 *   p   ▶ Play       — hand off to an AI agent (opens the mode picker)
 *   d   💬 Discuss   — open the step's inline thread
 *   m   ⊞ AI Assist  — open the TUI-native inline AI Assist pane (`:ai`)
 *
 * The widget owns no business logic — `handleKey` resolves a keystroke to a
 * `WorkflowMode` and fires the registered `onSelect` callback; the screen wires
 * `onSelect` to the actual run-start / thread / `:ai`-pane navigation. This is
 * the TUI sibling of the web `ModeRow` primitive and the `fulcrum mode` CLI
 * command — all three share the same four-mode vocabulary so the surfaces never
 * drift.
 */

import pc from "picocolors";

/**
 * A canonical workflow mode — the TUI mirror of the web `@fulcrum/ui-kit`
 * `WorkflowMode`. The web primitive names AI Assist `assist`; the TUI uses the
 * same id so the surfaces stay locked.
 */
export type WorkflowMode = "manual" | "play" | "discuss" | "assist";

/** One mode affordance: id, OD glyph, label, and its per-Step keybinding. */
export interface ModeAffordance {
  /** The canonical mode id — shared with the web `ModeRow` + the `fulcrum mode` CLI. */
  mode: WorkflowMode;
  /** OD glyph (DESIGN.md §4.13: `✋ ▶ 💬 ⊞`). */
  glyph: string;
  /** Long-form label (DESIGN.md §4.13). */
  label: string;
  /** The CLI-TUI-UX §7.4 keybinding that activates this mode on a focused Step. */
  keybinding: string;
}

/**
 * The four canonical mode affordances, in OD left→right order. `keybinding`
 * follows CLI-TUI-UX §7.4 (`p` Play, `d` Discuss, `m` mode picker / AI Assist)
 * and DESIGN.md §4.11; `a` selects Manual (the leftmost mode), `h` is the
 * vim-style alias so a Helix/vim user reaches it without leaving the home row.
 */
export const MODE_AFFORDANCES: readonly ModeAffordance[] = [
  { mode: "manual", glyph: "✋", label: "Manual", keybinding: "a" },
  { mode: "play", glyph: "▶", label: "Play", keybinding: "p" },
  { mode: "discuss", glyph: "💬", label: "Discuss", keybinding: "d" },
  { mode: "assist", glyph: "⊞", label: "AI Assist", keybinding: "m" },
];

/** vim-style aliases that also select a mode (Manual reachable via `h`). */
const MODE_KEY_ALIASES: Record<string, WorkflowMode> = {
  a: "manual",
  h: "manual",
  p: "play",
  d: "discuss",
  m: "assist",
};

export interface ModePickerOpts {
  /** The focused Step's addressable id (rendered into the row context). */
  stepId?: string;
  /** Initially-selected mode. Defaults to `manual` — the OD default-pressed mode. */
  value?: WorkflowMode;
  /** Fired whenever a mode is selected via a keybinding or `select()`. */
  onSelect?: (mode: WorkflowMode, stepId?: string) => void;
}

/**
 * The compact per-Step mode row for the TUI. Renders the four mode glyphs as a
 * single line (`role`-equivalent: a toolbar of mode buttons) and resolves the
 * CLI-TUI-UX §7.4 keybindings to mode selections.
 */
export class ModePicker {
  private _value: WorkflowMode;
  private readonly stepId?: string;
  private readonly onSelect?: (mode: WorkflowMode, stepId?: string) => void;

  constructor(opts: ModePickerOpts = {}) {
    this._value = opts.value ?? "manual";
    this.stepId = opts.stepId;
    this.onSelect = opts.onSelect;
  }

  /** The currently-selected mode. */
  get value(): WorkflowMode {
    return this._value;
  }

  /** The Step id this row is bound to, if any. */
  get step(): string | undefined {
    return this.stepId;
  }

  /** Select a mode programmatically — fires `onSelect`. */
  select(mode: WorkflowMode): void {
    this._value = mode;
    this.onSelect?.(mode, this.stepId);
  }

  /**
   * Resolve a keystroke to a mode and select it (CLI-TUI-UX §7.4). Returns the
   * selected mode when the key is a mode keybinding, or `null` when the key is
   * not handled — so the screen can fall through to its own key handling.
   */
  handleKey(key: string): WorkflowMode | null {
    const mode = MODE_KEY_ALIASES[key.toLowerCase()];
    if (!mode) return null;
    this.select(mode);
    return mode;
  }

  /** The keybindings this row exposes — fed to the `HelpOverlay` so `?` lists them. */
  keybindings(): Array<{ key: string; action: string }> {
    return MODE_AFFORDANCES.map((m) => ({
      key: m.keybinding,
      action: `${m.glyph} ${m.label}`,
    }));
  }

  /**
   * Render the compact mode row as one line — the OD `.mode-row compact` form:
   * the four mode glyphs, the selected one reverse-video (the OD `aria-pressed`
   * equivalent), each followed by its keybinding hint in dim.
   */
  render(): string {
    const cells = MODE_AFFORDANCES.map((m) => {
      const active = m.mode === this._value;
      const cell = `${m.glyph} ${m.label}`;
      const painted = active ? pc.inverse(` ${cell} `) : ` ${cell} `;
      return `${painted}${pc.dim(`[${m.keybinding}]`)}`;
    });
    return cells.join("  ");
  }
}
