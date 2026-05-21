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
 * Mode keys (CLI-TUI-UX §7.4 + DESIGN.md §4.11, per focused Step). Every
 * Step-bearing screen already binds bare `a` `p` `d` to its own list/action
 * keys, so the ModePicker reaches the four modes through a collision-free `m`
 * **chord**: press `m`, then the mode selector:
 *   m a   ✋ Manual   : work the step yourself (the leftmost mode)
 *   m p   ▶ Play      : hand off to an AI agent
 *   m d   💬 Discuss  : open the step's inline thread
 *   m i   ⊞ AI Assist : open the TUI-native inline AI Assist pane (`:ai`)
 *
 * The `m` prefix is disjoint from the global palette (`:`), help (`?`), and
 * navigation chords (`j` `k` `q` `H` `L`, the `g` stage chords, `/` search),
 * and from every screen action key: see `MODE_CHORD_PREFIX`,
 * `MODE_RESERVED_KEYS`, and `modeKeyCollidesWith`, which the parity tests use
 * to prove the contract.
 *
 * The widget owns no business logic: `handleChordKey` resolves the `m` chord
 * to a `WorkflowMode` and fires the registered `onSelect` callback; the screen
 * wires `onSelect` to the actual run-start / thread / `:ai`-pane navigation.
 * This is the TUI sibling of the web `ModeRow` primitive: both share the same
 * four-mode vocabulary so the surfaces never drift.
 */

import pc from "picocolors";

/**
 * A canonical workflow mode: the TUI mirror of the web `@fulcrum/ui-kit`
 * `WorkflowMode`. The web primitive names AI Assist `assist`; the TUI uses the
 * same id so the surfaces stay locked.
 */
export type WorkflowMode = "manual" | "play" | "discuss" | "assist";

/** One mode affordance: id, OD glyph, label, and its per-Step chord selector. */
export interface ModeAffordance {
  /** The canonical mode id: shared with the web `ModeRow` + the `fulcrum mode` CLI. */
  mode: WorkflowMode;
  /** OD glyph (DESIGN.md §4.13: `✋ ▶ 💬 ⊞`). */
  glyph: string;
  /** Long-form label (DESIGN.md §4.13). */
  label: string;
  /**
   * The single-key mode selector pressed *after* the `m` chord prefix
   * (`m a` Manual, `m p` Play, `m d` Discuss, `m i` AI Assist). The full
   * documented keybinding for the row is `m <keybinding>`.
   */
  keybinding: string;
}

/** The chord prefix every Step-mode keybinding starts with (CLI-TUI-UX §7.4). */
export const MODE_CHORD_PREFIX = "m";

/**
 * The four canonical mode affordances, in OD left→right order. `keybinding` is
 * the second key of the `m` chord (CLI-TUI-UX §7.4): `m a` Manual, `m p` Play,
 * `m d` Discuss, `m i` AI Assist. `i` (not `m`) selects AI Assist so the chord
 * is never the ambiguous double-tap `m m`.
 */
export const MODE_AFFORDANCES: readonly ModeAffordance[] = [
  { mode: "manual", glyph: "✋", label: "Manual", keybinding: "a" },
  { mode: "play", glyph: "▶", label: "Play", keybinding: "p" },
  { mode: "discuss", glyph: "💬", label: "Discuss", keybinding: "d" },
  { mode: "assist", glyph: "⊞", label: "AI Assist", keybinding: "i" },
];

/** The mode-selector keystrokes the chord claims after the `m` prefix (`a p d i`). */
export const MODE_RESERVED_KEYS: readonly string[] = MODE_AFFORDANCES.map(
  (m) => m.keybinding,
);

/**
 * The full documented keybinding for each mode: the `m` chord plus the
 * selector (`m a`, `m p`, `m d`, `m i`). The parity / snapshot tests assert the
 * HelpOverlay and the rendered row carry these exact strings.
 */
export const MODE_CHORD_KEYBINDINGS: readonly string[] = MODE_AFFORDANCES.map(
  (m) => `${MODE_CHORD_PREFIX} ${m.keybinding}`,
);

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

/**
 * True when a keystroke would collide with a global palette / help / nav chord.
 * The parity tests call this on `MODE_CHORD_PREFIX` to prove `m` is collision-
 * free, and on each `MODE_RESERVED_KEYS` selector for the post-prefix keys.
 */
export function modeKeyCollidesWith(
  keybinding: string,
  reserved: readonly string[] = PALETTE_HELP_NAV_KEYS,
): boolean {
  return reserved.includes(keybinding);
}

/** Mode-selector keystroke -> `WorkflowMode` (the second key of the `m` chord). */
const MODE_KEY_ALIASES: Record<string, WorkflowMode> = {
  a: "manual",
  p: "play",
  d: "discuss",
  i: "assist",
};

export interface ModePickerOpts {
  /** The focused Step's addressable id (rendered into the row context). */
  stepId?: string;
  /** Initially-selected mode. Defaults to `manual`: the OD default-pressed mode. */
  value?: WorkflowMode;
  /** Fired whenever a mode is selected via the chord or `select()`. */
  onSelect?: (mode: WorkflowMode, stepId?: string) => void;
}

/**
 * The per-Step mode row for the TUI. Renders the four mode affordances as a
 * single line (a toolbar of mode buttons) and resolves the collision-free `m`
 * chord to mode selections.
 */
export class ModePicker {
  private _value: WorkflowMode;
  private readonly stepId?: string;
  private readonly onSelect?: (mode: WorkflowMode, stepId?: string) => void;
  /** True while the `m` chord prefix is armed and waiting for the selector key. */
  private chordArmed = false;

  constructor(opts: ModePickerOpts = {}) {
    this._value = opts.value ?? "manual";
    this.stepId = opts.stepId;
    this.onSelect = opts.onSelect;
  }

  /** True while the `m` chord is armed: the next keystroke is a mode selector. */
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
   * Resolve a mode-selector keystroke to a mode and select it. The selector is
   * the second key of the `m` chord (`a p d i`); a non-selector key returns
   * `null` so the caller can fall through to its own handling. Most screens use
   * `handleChordKey` (which drives the full `m`-then-selector chord) rather than
   * calling this directly.
   */
  handleKey(key: string): WorkflowMode | null {
    const mode = MODE_KEY_ALIASES[key];
    if (!mode) return null;
    this.select(mode);
    return mode;
  }

  /**
   * Screen-facing chord handler: drives the collision-free `m` chord. A
   * Step-bearing screen delegates every keystroke to this inside its own
   * `handleKey`:
   *   - bare `m` arms the chord and is consumed (returns `true`);
   *   - while armed, `a` / `p` / `d` / `i` select the mode, fire `onSelect`,
   *     disarm, and are consumed;
   *   - while armed, any other key disarms and is NOT consumed, so the screen
   *     handles it normally;
   *   - when not armed, every non-`m` key is ignored (returns `false`).
   * The screen action keys (`d` dispatch, `a` reassign, …) are therefore only
   * shadowed for the single keystroke after `m`: never otherwise.
   */
  handleChordKey(key: string): boolean {
    if (this.chordArmed) {
      this.chordArmed = false;
      return this.handleKey(key) !== null;
    }
    if (key === MODE_CHORD_PREFIX) {
      this.chordArmed = true;
      return true;
    }
    return false;
  }

  /** Disarm the `m` chord: used when a screen swaps focus away from the row. */
  resetChord(): void {
    this.chordArmed = false;
  }

  /**
   * The keybindings this row exposes: fed to the `HelpOverlay` so `?` lists
   * them. Each `key` is the full `m`-chord form (`m a`, `m p`, `m d`, `m i`).
   */
  keybindings(): Array<{ key: string; action: string }> {
    return MODE_AFFORDANCES.map((m) => ({
      key: `${MODE_CHORD_PREFIX} ${m.keybinding}`,
      action: `${m.glyph} ${m.label}`,
    }));
  }

  /**
   * Render the mode row as one line: the four mode affordances with labels,
   * the selected one reverse-video (the OD `aria-pressed` equivalent), each
   * followed by its full `m`-chord key hint in dim (`[m a]`, `[m p]`, …). When
   * the chord is armed the row prefixes an `m>` cue so the operator knows the
   * next keystroke is a mode selector.
   *
   * The row is a single line; a consuming screen on a width-starved terminal
   * clips it through `truncateWide`, never wrapping it.
   */
  render(): string {
    const cells = MODE_AFFORDANCES.map((m) => {
      const active = m.mode === this._value;
      const cell = `${m.glyph} ${m.label}`;
      const painted = active ? pc.inverse(` ${cell} `) : ` ${cell} `;
      return `${painted}${pc.dim(`[${MODE_CHORD_PREFIX} ${m.keybinding}]`)}`;
    });
    const row = cells.join("  ");
    return this.chordArmed ? `${pc.inverse(" m> ")} ${row}` : row;
  }
}
