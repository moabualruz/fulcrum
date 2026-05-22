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
 *   m m   ✋ Manual   : work the step yourself (the leftmost mode)
 *   m p   ▶ Play      : hand off to an AI agent
 *   m d   💬 Discuss  : open the step's inline thread
 *   m a/i ⊞ AI Assist : open the TUI-native inline AI Assist pane (`:ai`)
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
  /** The rendered chord hint (`m`, `m p`, `m d`, `m a`). */
  keybinding: string;
  /** Extra selector keys accepted after the `m` prefix. */
  aliases?: readonly string[];
}

/** ModePicker chord prefix. Bare screen keys remain owned by each workbench. */
export const MODE_CHORD_PREFIX = "m";

const MODE_DETAILS: Record<WorkflowMode, Omit<ModeAffordance, "mode">> = {
  manual: { glyph: "✋", label: "Manual", keybinding: "m" },
  play: { glyph: "▶", label: "Play", keybinding: "m p" },
  discuss: { glyph: "💬", label: "Discuss", keybinding: "m d" },
  assist: { glyph: "⊞", label: "AI Assist", keybinding: "m a", aliases: ["i"] },
};

/** The four canonical mode affordances, in OD left→right order. */
export const MODE_AFFORDANCES: readonly ModeAffordance[] = WorkflowModeValues.map((mode) => ({
  mode,
  ...MODE_DETAILS[mode],
}));

/** The mode-selector keystrokes claimed by the picker (`m` chord prefix only). */
export const MODE_RESERVED_KEYS: readonly string[] = [MODE_CHORD_PREFIX];

/** Chord hints rendered in the ModePicker row. */
export const MODE_CHORD_KEYBINDINGS: readonly string[] = MODE_AFFORDANCES.flatMap((m) => [
  m.keybinding,
  ...(m.aliases ?? []).map((alias) => `${MODE_CHORD_PREFIX} ${alias}`),
]);

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

/** Post-prefix mode selector -> `WorkflowMode`. */
const MODE_KEY_ALIASES: Record<string, WorkflowMode> = {
  m: "manual",
  p: "play",
  d: "discuss",
  a: "assist",
  i: "assist",
};

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
  private chordArmed = false;

  constructor(opts: ModePickerOpts = {}) {
    this._value = opts.value ?? "manual";
    this.stepId = opts.stepId;
    this.onSelect = opts.onSelect;
  }

  get isChordArmed(): boolean {
    return this.chordArmed;
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
   * Resolve the collision-free `m` chord. Bare screen keys (`p`, `d`, `a`, ...)
   * return `null` until `m` arms the picker, so workbenches keep their own keys.
   */
  handleKey(key: string): WorkflowMode | null {
    if (!this.chordArmed) {
      if (key !== MODE_CHORD_PREFIX) return null;
      this.chordArmed = true;
      this.select("manual");
      return "manual";
    }

    this.chordArmed = false;
    const mode = MODE_KEY_ALIASES[key];
    if (!mode) return null;
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

  /** Disarm the `m` chord: used when a screen swaps focus away from the row. */
  resetChord(): void {
    this.chordArmed = false;
  }

  /**
   * The keybindings this row exposes: fed to the `HelpOverlay` so `?` lists them.
   */
  keybindings(): Array<{ key: string; action: string }> {
    return MODE_AFFORDANCES.flatMap((m) => {
      const action = `${m.glyph} ${m.label}`;
      return [
        { key: m.keybinding, action },
        ...(m.aliases ?? []).map((alias) => ({
          key: `${MODE_CHORD_PREFIX} ${alias}`,
          action,
        })),
      ];
    });
  }

  /**
   * Render the mode row as one line: the four mode affordances with labels,
   * the selected one reverse-video (the OD `aria-pressed` equivalent), each
   * followed by its key hint in dim (`[m]`, `[m p]`, …).
   *
   * The row is a single line; a consuming screen on a width-starved terminal
   * clips it through `truncateWide`, never wrapping it.
   */
  render(): string {
    const cells = MODE_AFFORDANCES.map((m) => {
      const active = m.mode === this._value;
      const cell = `${m.glyph} ${m.label}`;
      const painted = active ? pc.inverse(` ${cell} `) : ` ${cell} `;
      const hints = [m.keybinding, ...(m.aliases ?? []).map((alias) => `${MODE_CHORD_PREFIX} ${alias}`)]
        .map((hint) => pc.dim(`[${hint}]`))
        .join("");
      return `${painted}${hints}`;
    });
    const row = `${this.chordArmed ? `${pc.dim("m>")} ` : ""}${cells.join("  ")}`;
    return row;
  }
}
