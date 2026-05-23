/**
 * ModePicker: the TUI per-Step mode affordance row (DESIGN.md §4.11, §4.13;
 * CLI-TUI-UX.md §7.4).
 *
 * Every Step in the web shell carries the `✋ Manual / ▶ Play / 💬 Discuss /
 * ⊞ AI Assist` ModeAffordance row. `prd-web-mode-affordance-system` makes that
 * affordance universal across surfaces; this widget is the TUI equivalent: the
 * compact mode row rendered on a focused Step, mirroring the OD `.mode-row`
 * markup and exposing the same four modes as the web `@fulcrum/ui-kit`
 * `ModeRow` primitive.
 *
 * Mode keys (CLI-TUI-UX §7.4 + DESIGN.md §4.11, per focused Step):
 *   m     Open picker without committing a mode
 *   p     ▶ Play: hand off to an AI agent
 *   d     💬 Discuss: open the step's inline thread
 *   :ai   Open the TUI-native inline AI Assist pane
 *
 * The widget owns no business logic: `handleKey` resolves the mode key
 * to a `WorkflowMode` and fires the registered `onSelect` callback; the screen
 * wires `onSelect` to the actual run-start / thread / `:ai`-pane navigation.
 * This is the TUI sibling of the web `ModeRow` primitive: both share the same
 * four-mode vocabulary so the surfaces never drift.
 */

import pc from "picocolors";
import { WorkflowModeValues, type WorkflowMode } from "@fulcrum/shared-dto";

/**
 * A canonical workflow mode: the TUI mirror of the web `@fulcrum/ui-kit`
 * `WorkflowMode`. The web primitive names AI Assist `assist`; the TUI uses the
 * same id so the surfaces stay locked.
 */
export type { WorkflowMode } from "@fulcrum/shared-dto";

/** One mode affordance: id, OD glyph, label, and its per-Step selector. */
export interface ModeAffordance {
  /** The canonical mode id: shared with the web `ModeRow` + the `fulcrum mode` CLI. */
  mode: WorkflowMode;
  /** OD glyph (DESIGN.md §4.13: `✋ ▶ 💬 ⊞`). */
  glyph: string;
  /** Long-form label (DESIGN.md §4.13). */
  label: string;
  /** The rendered selector hint (`m`, `p`, `d`, `:ai`). */
  keybinding: string;
}

/** ModePicker open key. Kept under the old export name for compatibility. */
export const MODE_CHORD_PREFIX = "m";

const MODE_DETAILS: Record<WorkflowMode, Omit<ModeAffordance, "mode">> = {
  manual: { glyph: "✋", label: "Manual", keybinding: "m" },
  play: { glyph: "▶", label: "Play", keybinding: "p" },
  discuss: { glyph: "💬", label: "Discuss", keybinding: "d" },
  assist: { glyph: "⊞", label: "AI Assist", keybinding: ":ai" },
};

/** The four canonical mode affordances, in OD left→right order. */
export const MODE_AFFORDANCES: readonly ModeAffordance[] = WorkflowModeValues.map((mode) => ({
  mode,
  ...MODE_DETAILS[mode],
}));

/** The mode-selector keystrokes claimed by the picker. */
export const MODE_RESERVED_KEYS: readonly string[] = [MODE_CHORD_PREFIX, "p", "d"];

/** Key hints rendered in the ModePicker row. */
export const MODE_CHORD_KEYBINDINGS: readonly string[] = MODE_AFFORDANCES.map((m) => m.keybinding);

/**
 * The global keystrokes the ModePicker must never shadow: the command palette
 * (`:`), the help overlay (`?`), and the list / stage navigation chords
 * (`j` `k` `q` `H` `L`, the `g` stage-chord prefix, `/` search). The parity
 * tests assert the `m` chord prefix is disjoint from this set.
 */
export const PALETTE_HELP_NAV_KEYS: readonly string[] = [
  ":",
  "?",
  "/",
  "j",
  "k",
  "q",
  "H",
  "L",
  "g",
];

export function modeKeyCollidesWith(
  keybinding: string,
  reserved: readonly string[] = PALETTE_HELP_NAV_KEYS,
): boolean {
  return reserved.includes(keybinding);
}

/** Bare mode selector -> `WorkflowMode`. */
const MODE_KEY_ALIASES: Record<string, WorkflowMode> = {
  p: "play",
  d: "discuss",
};

export type ModePickerKeyAction = WorkflowMode | "picker";

export interface ModePickerOpts {
  /** The focused Step's addressable id (rendered into the row context). */
  stepId?: string;
  /** Initially-selected mode. Defaults to `manual`: the OD default-pressed mode. */
  value?: WorkflowMode;
  /** Fired whenever a mode is selected via key or `select()`. */
  onSelect?: (mode: WorkflowMode, stepId?: string) => void;
}

/**
 * The per-Step mode row for the TUI. Renders the four mode affordances as a
   * single line (a toolbar of mode buttons) and resolves `m`-prefixed mode selections.
 */
export class ModePicker {
  private _value: WorkflowMode;
  private readonly stepId?: string;
  private readonly onSelect?: (mode: WorkflowMode, stepId?: string) => void;
  private pickerOpen = false;

  constructor(opts: ModePickerOpts = {}) {
    this._value = opts.value ?? "manual";
    this.stepId = opts.stepId;
    this.onSelect = opts.onSelect;
  }

  get isChordArmed(): boolean {
    return this.pickerOpen;
  }

  get isPickerOpen(): boolean {
    return this.pickerOpen;
  }

  /** The currently-selected mode. */
  get value(): WorkflowMode {
    return this._value;
  }

  /** The Step id this row is bound to, if any. */
  get step(): string | undefined {
    return this.stepId;
  }

  /** Select a mode programmatically: fires `onSelect`. */
  select(mode: WorkflowMode): void {
    this._value = mode;
    this.onSelect?.(mode, this.stepId);
  }

  /**
   * Resolve the CLI-TUI-UX §7.4 bare-key contract. `p` and `d` commit Play /
   * Discuss; `m` only opens the picker and leaves the selected mode unchanged.
   */
  handleKey(key: string): ModePickerKeyAction | null {
    if (key === MODE_CHORD_PREFIX) {
      this.pickerOpen = true;
      return "picker";
    }

    const mode = MODE_KEY_ALIASES[key];
    if (!mode) return null;
    this.pickerOpen = false;
    this.select(mode);
    return mode;
  }

  /**
   * @deprecated Use `handleKey`. Kept as a compatibility alias for older
   * screens/tests.
   */
  handleChordKey(key: string): boolean {
    return this.handleKey(key) !== null;
  }

  /** Close picker state: used when a screen swaps focus away from the row. */
  resetChord(): void {
    this.pickerOpen = false;
  }

  /**
   * The keybindings this row exposes: fed to the `HelpOverlay` so `?` lists them.
   */
  keybindings(): Array<{ key: string; action: string }> {
    return [
      { key: MODE_CHORD_PREFIX, action: "Open mode picker" },
      ...MODE_AFFORDANCES
        .filter((m) => m.mode !== "manual")
        .map((m) => ({ key: m.keybinding, action: `${m.glyph} ${m.label}` })),
    ];
  }

  /**
   * Render the mode row as one line: the four mode affordances with labels,
   * the selected one reverse-video (the OD `aria-pressed` equivalent), each
   * followed by its key hint in dim (`[m]`, `[p]`, …).
   *
   * The row is a single line; a consuming screen on a width-starved terminal
   * clips it through `truncateWide`, never wrapping it.
   */
  render(): string {
    const cells = MODE_AFFORDANCES.map((m) => {
      const active = m.mode === this._value;
      const cell = `${m.glyph} ${m.label}`;
      const painted = active ? pc.inverse(` ${cell} `) : ` ${cell} `;
      const hints = pc.dim(`[${m.keybinding}]`);
      return `${painted}${hints}`;
    });
    const row = `${this.pickerOpen ? `${pc.dim("picker>")} ` : ""}${cells.join("  ")}`;
    return row;
  }
}
