/**
 * ModePicker: the TUI per-Step mode affordance row (DESIGN.md §4.11, §4.13;
 * CLI-TUI-UX.md §7.4).
 *
 * Every Step in the product shell carries the `✋ Manual / ▶ Play / 💬 Discuss /
 * ⊞ AI Assist` affordance row. This widget is the TUI equivalent: the compact
 * mode row rendered on a focused Step, plus the terminal-native picker opened
 * by the Play / Discuss / mode-picker keys.
 *
 * Mode keys (CLI-TUI-UX §7.4 + DESIGN.md §4.11, per focused Step):
 *   m   ✋ Manual   : work the step yourself (the leftmost mode)
 *   p   ▶ Play      : hand off to an AI agent
 *   d   💬 Discuss  : open the step's inline thread
 *   a   ⊞ AI Assist : open the TUI-native inline AI Assist pane (`:ai`)
 *
 * The widget owns interaction intent only: `handleKey` resolves p/d/m/a to a
 * typed action, and the screen wires those actions to actual run-start, thread,
 * or `:ai` navigation paths.
 */

import pc from "picocolors";

/**
 * A canonical workflow mode: the TUI mirror of the web `@fulcrum/ui-kit`
 * `WorkflowMode`. The web primitive names AI Assist `assist`; the TUI uses the
 * same id so the surfaces stay locked.
 */
export type WorkflowMode = "manual" | "play" | "discuss" | "assist";

/** One mode affordance: id, OD glyph, label, and its per-Step selector. */
export interface ModeAffordance {
  /** The canonical mode id: shared with the web `ModeRow` + the `fulcrum mode` CLI. */
  mode: WorkflowMode;
  /** OD glyph (DESIGN.md §4.13: `✋ ▶ 💬 ⊞`). */
  glyph: string;
  /** Long-form label (DESIGN.md §4.13). */
  label: string;
  /**
   * The single-key mode selector (`m` Manual, `p` Play, `d` Discuss,
   * `a` AI Assist).
   */
  keybinding: string;
}

/** @deprecated ModePicker now uses direct p/d/m/a selectors; kept for compatibility. */
export const MODE_CHORD_PREFIX = "m";

/**
 * The four canonical mode affordances, in OD left→right order.
 */
export const MODE_AFFORDANCES: readonly ModeAffordance[] = [
  { mode: "manual", glyph: "✋", label: "Manual", keybinding: "m" },
  { mode: "play", glyph: "▶", label: "Play", keybinding: "p" },
  { mode: "discuss", glyph: "💬", label: "Discuss", keybinding: "d" },
  { mode: "assist", glyph: "⊞", label: "AI Assist", keybinding: "a" },
];

/** The mode-selector keystrokes claimed by the picker (`m p d a`). */
export const MODE_RESERVED_KEYS: readonly string[] = MODE_AFFORDANCES.map(
  (m) => m.keybinding,
);

/** @deprecated Direct selectors are canonical; legacy name now mirrors them. */
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

/** Mode-selector keystroke -> `WorkflowMode`; `m` opens the picker without committing. */
const MODE_KEY_ALIASES: Record<string, WorkflowMode> = {
  p: "play",
  d: "discuss",
  a: "assist",
};

export interface ModePickerChoice {
  id: string;
  label: string;
  detail?: string;
}

export type ModePickerAction =
  | {
    kind: "play-picker";
    mode: "play";
    stepId?: string;
    agentId: string;
    modelId: string;
    policyId: string;
  }
  | {
    kind: "discuss-thread";
    mode: "discuss";
    stepId?: string;
  }
  | {
    kind: "mode-picker";
    mode: WorkflowMode;
    stepId?: string;
  }
  | {
    kind: "ai-assist";
    mode: "assist";
    stepId?: string;
  }
  | {
    kind: "close";
    mode: WorkflowMode;
    stepId?: string;
  };

export interface ModePickerOpts {
  /** The focused Step's addressable id (rendered into the row context). */
  stepId?: string;
  /** Initially-selected mode. Defaults to `manual`: the OD default-pressed mode. */
  value?: WorkflowMode;
  /** Fired whenever a mode is selected via key or `select()`. */
  onSelect?: (mode: WorkflowMode, stepId?: string) => void;
  /** Fired whenever a key opens a terminal-native picker/thread action. */
  onAction?: (action: ModePickerAction) => void;
  /** Configured CLI agents offered by the Play picker. */
  agents?: readonly ModePickerChoice[];
  /** Configured models offered by the Play picker. */
  models?: readonly ModePickerChoice[];
  /** Permission policies offered by the Play picker. */
  policies?: readonly ModePickerChoice[];
}

type ModePickerPopover = "closed" | "play" | "mode" | "discuss" | "assist";

const DEFAULT_AGENTS: readonly ModePickerChoice[] = [
  { id: "codex", label: "Codex", detail: "local repo work" },
  { id: "claude-code", label: "Claude Code", detail: "large refactors" },
  { id: "gemini-cli", label: "Gemini CLI", detail: "broad synthesis" },
  { id: "opencode", label: "OpenCode", detail: "terminal tasks" },
  { id: "pi-cli", label: "Pi CLI", detail: "lightweight automation" },
];

const DEFAULT_MODELS: readonly ModePickerChoice[] = [
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "claude-opus-4.7", label: "Claude Opus 4.7" },
  { id: "gemini-3-pro", label: "Gemini 3 Pro" },
];

const DEFAULT_POLICIES: readonly ModePickerChoice[] = [
  { id: "review_each_tool", label: "Review each tool" },
  { id: "read_only", label: "Read only" },
  { id: "auto", label: "Auto" },
];

/**
 * The per-Step mode row for the TUI. Renders the four mode affordances as a
   * single line (a toolbar of mode buttons) and resolves p/d/m/a selections.
 */
export class ModePicker {
  private _value: WorkflowMode;
  private readonly stepId?: string;
  private readonly onSelect?: (mode: WorkflowMode, stepId?: string) => void;
  private readonly onAction?: (action: ModePickerAction) => void;
  private readonly agents: readonly ModePickerChoice[];
  private readonly models: readonly ModePickerChoice[];
  private readonly policies: readonly ModePickerChoice[];
  private popover: ModePickerPopover = "closed";
  /** @deprecated Direct selectors do not arm a chord. */
  private chordArmed = false;

  constructor(opts: ModePickerOpts = {}) {
    this._value = opts.value ?? "manual";
    this.stepId = opts.stepId;
    this.onSelect = opts.onSelect;
    this.onAction = opts.onAction;
    this.agents = opts.agents?.length ? opts.agents : DEFAULT_AGENTS;
    this.models = opts.models?.length ? opts.models : DEFAULT_MODELS;
    this.policies = opts.policies?.length ? opts.policies : DEFAULT_POLICIES;
  }

  /** @deprecated Direct selectors do not arm a chord. */
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

  /** Whether a picker/thread popover is open under the row. */
  get isOpen(): boolean {
    return this.popover !== "closed";
  }

  /** Select a mode programmatically: fires `onSelect`. */
  select(mode: WorkflowMode): void {
    this._value = mode;
    this.onSelect?.(mode, this.stepId);
  }

  /**
   * Resolve a mode-selector keystroke to an action. A non-selector key returns
   * `null` so the caller can fall through to its own handling.
   */
  handleKey(key: string): ModePickerAction | null {
    if (key === "\x1b") {
      if (!this.isOpen) return null;
      this.close();
      return this.emitAction({ kind: "close", mode: this._value, stepId: this.stepId });
    }

    if (key === "m") {
      this.popover = "mode";
      return this.emitAction({ kind: "mode-picker", mode: this._value, stepId: this.stepId });
    }

    const mode = MODE_KEY_ALIASES[key];
    if (!mode) return null;
    this.select(mode);

    if (mode === "play") {
      this.popover = "play";
      return this.emitAction({
        kind: "play-picker",
        mode,
        stepId: this.stepId,
        agentId: this.agents[0]?.id ?? "codex",
        modelId: this.models[0]?.id ?? "gpt-5.4",
        policyId: this.policies[0]?.id ?? "review_each_tool",
      });
    }

    if (mode === "discuss") {
      this.popover = "discuss";
      return this.emitAction({ kind: "discuss-thread", mode, stepId: this.stepId });
    }

    this.popover = "assist";
    return this.emitAction({ kind: "ai-assist", mode: "assist", stepId: this.stepId });
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

  /** Close any open picker/thread popover. */
  close(): void {
    this.popover = "closed";
  }

  /**
   * The keybindings this row exposes: fed to the `HelpOverlay` so `?` lists
   * them.
   */
  keybindings(): Array<{ key: string; action: string }> {
    return MODE_AFFORDANCES.map((m) => ({
      key: m.keybinding,
      action: modeActionLabel(m),
    }));
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
      return `${painted}${pc.dim(`[${m.keybinding}]`)}`;
    });
    const row = cells.join("  ");
    return row;
  }

  /** Render the terminal-native picker/thread popover opened by p/d/m/a. */
  renderPopover(): string[] {
    if (this.popover === "closed") return [];
    if (this.popover === "play") {
      return [
        pc.bold("  Mode picker · Play current step"),
        `  step   ${this.stepId ?? "current"}`,
        `  agent  > ${formatChoices(this.agents)}`,
        `  model  > ${formatChoices(this.models)}`,
        `  policy > ${formatChoices(this.policies)}`,
        pc.dim("  actions  Enter Play  P Preset  Esc close"),
      ];
    }
    if (this.popover === "discuss") {
      return [
        pc.bold("  Discuss current step"),
        `  step   ${this.stepId ?? "current"}`,
        pc.dim("  inline thread open  Enter send  Esc close"),
      ];
    }
    if (this.popover === "assist") {
      return [
        pc.bold("  AI Assist current step"),
        `  step   ${this.stepId ?? "current"}`,
        pc.dim("  opens :ai with current step scope"),
      ];
    }
    return [
      pc.bold("  Mode picker"),
      `  current ${modeLabel(this._value)}`,
      pc.dim("  p Play current step  d Discuss current step  a AI Assist  Esc close"),
      `  agent  > ${formatChoices(this.agents)}`,
      `  model  > ${formatChoices(this.models)}`,
      `  policy > ${formatChoices(this.policies)}`,
    ];
  }

  private emitAction(action: ModePickerAction): ModePickerAction {
    this.onAction?.(action);
    return action;
  }
}

function modeLabel(mode: WorkflowMode): string {
  return MODE_AFFORDANCES.find((candidate) => candidate.mode === mode)?.label ?? mode;
}

function modeActionLabel(mode: ModeAffordance): string {
  if (mode.mode === "play") return `${mode.glyph} Play current step`;
  if (mode.mode === "discuss") return `${mode.glyph} Discuss current step`;
  if (mode.mode === "assist") return `${mode.glyph} AI Assist current step`;
  return `${mode.glyph} Open mode picker`;
}

function formatChoices(choices: readonly ModePickerChoice[]): string {
  return choices
    .map((choice, index) => {
      const label = index === 0 ? pc.inverse(` ${choice.label} `) : choice.label;
      return choice.detail ? `${label} ${pc.dim(choice.detail)}` : label;
    })
    .join("  ");
}
