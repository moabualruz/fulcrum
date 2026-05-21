/**
 * Palette: the TUI command palette overlay.
 *
 * Two grammars share one widget (CLI-TUI-UX.md §7.1, §9: apps/tui/CONTEXT.md
 * ColonPalette):
 *
 *  - **Fuzzy mode** (default / `>` prefix): sequential-character fuzzy filter
 *    over `items`, plus the `kind:X` filter token. This is the legacy Cmd/K
 *    search behaviour, kept intact for the launcher's item picker.
 *  - **ColonPalette mode**: when the palette is opened as `:` the query is
 *    parsed as a CLI-grammar command (`:run new`, `:doctor`,
 *    `:agent invoke claude`). `completeQuery()` tab-completes against the CLI
 *    command tree; `PALETTE_SECTIONS` renders the OD `tui-runs.html` section
 *    structure (stages · step actions · search · agents/MCP/plugins/routes ·
 *    system).
 *
 * Esc closes the palette without running anything; the caller routes the
 * second key of a StageChord: the palette itself never steals `g`.
 */

import pc from "picocolors";

/** Sequential character fuzzy match. */
function fuzzyMatch(needle: string, haystack: string): boolean {
  let pos = 0;
  for (const ch of needle) {
    const idx = haystack.indexOf(ch, pos);
    if (idx === -1) return false;
    pos = idx + 1;
  }
  return true;
}

// ─── CLI command tree (ColonPalette `:` grammar) ───────────────────────────
//
// The ColonPalette tab-completes against the CLI command tree: "anything you
// can do in `fulcrum <cmd>` is `:<cmd>` in the TUI" (CLI-TUI-UX.md §9.1). The
// tree below mirrors the workflow-stage command groups from
// `apps/cli/src/index.ts` (WORKFLOW_STAGES) so the two surfaces stay dual;
// it lists the command verb plus its first-level subcommands, which is the
// completion depth a `:` prompt needs.

/** One CLI command: a top-level verb and its first-level subcommands. */
export interface CliCommandNode {
  /** Command verb: the word after `fulcrum` / `:`. */
  verb: string;
  /** First-level subcommands accepted after the verb. */
  subcommands: readonly string[];
}

/**
 * The CLI command tree the ColonPalette completes against. Mirrors the
 * `apps/cli/src/index.ts` workflow-stage command groups (Capture → Operate
 * plus AI Assist and cross-cutting). Kept intentionally first-level: the
 * palette completes `:run` → `:run new`, deeper args are typed free-form.
 */
export const CLI_COMMAND_TREE: readonly CliCommandNode[] = [
  // Capture
  { verb: "capture", subcommands: ["review", "status", "action"] },
  { verb: "docs", subcommands: ["template", "list"] },
  { verb: "search", subcommands: ["query"] },
  // Plan
  { verb: "product", subcommands: ["planning", "reports"] },
  { verb: "sprints", subcommands: ["list", "get", "create", "update", "delete", "add-task", "remove-task"] },
  // Build
  { verb: "task", subcommands: ["list", "get", "new", "create", "update", "delete"] },
  { verb: "tasks", subcommands: ["list", "get", "new", "create", "update", "delete"] },
  { verb: "work", subcommands: ["create", "inspect", "move", "link", "report"] },
  { verb: "run", subcommands: ["new", "show", "cancel", "retry", "pause", "replay"] },
  { verb: "runs", subcommands: ["list", "show", "cancel", "retry", "dispatch", "preview", "feed", "logs"] },
  { verb: "agent", subcommands: ["invoke", "list", "profile", "test"] },
  { verb: "agents", subcommands: ["list", "profile", "test"] },
  { verb: "routing", subcommands: ["rules", "assign", "simulate"] },
  // Review
  { verb: "review", subcommands: ["queue", "decision", "handoff"] },
  // Ship
  { verb: "artifacts", subcommands: ["list", "show", "upload", "accept", "reject", "download", "archive"] },
  { verb: "repos", subcommands: ["register", "list", "sync", "unregister", "status"] },
  { verb: "memory", subcommands: ["list", "get", "add", "delete", "search", "promote"] },
  // Operate
  { verb: "doctor", subcommands: [] },
  { verb: "install", subcommands: [] },
  { verb: "mcp", subcommands: ["list", "register", "unregister", "enable", "disable"] },
  { verb: "hooks", subcommands: ["list", "enable", "disable", "test"] },
  { verb: "skills", subcommands: ["sync", "upstream", "lint", "list"] },
  { verb: "settings", subcommands: ["list", "get", "set"] },
  { verb: "audit", subcommands: ["query", "export"] },
  { verb: "plugins", subcommands: ["list", "enable", "disable", "update"] },
  { verb: "routes", subcommands: ["list", "set"] },
  // AI Assist
  { verb: "ai", subcommands: ["start"] },
  { verb: "session", subcommands: ["list", "pause", "resume", "abort", "checkpoint", "restore", "watch"] },
];

/** Lookup of verb → subcommands, derived once from {@link CLI_COMMAND_TREE}. */
const CLI_VERBS: ReadonlyMap<string, readonly string[]> = new Map(
  CLI_COMMAND_TREE.map((n) => [n.verb, n.subcommands]),
);

/**
 * Tab-complete a ColonPalette query against the CLI command tree. `query` may
 * carry the leading `:`; it is stripped. Completion is two-level:
 *  - one token (`:ru`) → matching verbs (`run`, `runs`).
 *  - verb + partial subcommand (`:run n`) → matching `verb subcommand` pairs.
 * Returns the candidate command strings (no leading `:`), empty when nothing
 * matches.
 */
export function completeColonCommand(query: string): string[] {
  const raw = query.startsWith(":") ? query.slice(1) : query;
  const trimmedStart = raw.replace(/^\s+/, "");
  const tokens = trimmedStart.split(/\s+/);
  const verb = (tokens[0] ?? "").toLowerCase();

  // One token: complete the verb itself.
  if (tokens.length <= 1) {
    if (verb === "") return CLI_COMMAND_TREE.map((n) => n.verb);
    return CLI_COMMAND_TREE.map((n) => n.verb).filter((v) => v.startsWith(verb));
  }

  // Verb + (partial) subcommand: complete the subcommand.
  const subs = CLI_VERBS.get(verb);
  if (!subs) return [];
  const partial = (tokens[1] ?? "").toLowerCase();
  return subs
    .filter((s) => s.startsWith(partial))
    .map((s) => `${verb} ${s}`);
}

/**
 * Whether a ColonPalette query names a known CLI command. Accepts a bare verb
 * (`:doctor`) or `verb subcommand` (`:run new`). Used to gate Enter so the
 * palette never "runs" an unknown command.
 */
export function isKnownColonCommand(query: string): boolean {
  const raw = (query.startsWith(":") ? query.slice(1) : query).trim();
  if (raw === "") return false;
  const tokens = raw.split(/\s+/);
  const verb = (tokens[0] ?? "").toLowerCase();
  const subs = CLI_VERBS.get(verb);
  if (!subs) return false;
  if (tokens.length === 1) return true;
  return subs.includes((tokens[1] ?? "").toLowerCase());
}

// ─── OD palette section structure (tui-runs.html:1140-1180) ─────────────────

/** One actionable row inside an OD palette section. */
export interface PaletteCommand {
  /** Visible label of the action. */
  label: string;
  /** Key hint shown right-aligned (`g c`, `:run`, `p`, `?`). */
  hint: string;
}

/** One OD palette section: a dimmed header plus its command rows. */
export interface PaletteSection {
  /** Section header text: matches OD `tui-runs.html` exactly. */
  header: string;
  /** Command rows under the header. */
  commands: readonly PaletteCommand[];
}

/**
 * The OD `tui-runs.html` palette section structure (lines 1147-1179). Headers
 * and rows are verbatim from the OD export so the snapshot test locks real
 * copy: `stages`, `step actions`, `search`, `agents · MCP · plugins · routes`,
 * `system`.
 */
export const PALETTE_SECTIONS: readonly PaletteSection[] = [
  {
    header: "stages",
    commands: [
      { label: "open Capture", hint: "g c" },
      { label: "open Plan", hint: "g p" },
      { label: "open Build (runs)", hint: "g b" },
      { label: "open Build · board view", hint: "g B" },
      { label: "open Review", hint: "g r" },
      { label: "open Ship", hint: "g s" },
      { label: "open Operate / doctor", hint: "g o" },
      { label: "open Run detail (current)", hint: ":run" },
    ],
  },
  {
    header: "step actions",
    commands: [
      { label: "play current step (handoff to AI)", hint: "p" },
      { label: "discuss current step", hint: "d" },
      { label: "manual override", hint: "m" },
      { label: "ai assist (inline pane)", hint: ":ai" },
    ],
  },
  {
    header: "search",
    commands: [
      { label: "in-file search", hint: "/" },
      { label: "mention scope", hint: "@" },
      { label: "tag", hint: "#" },
      { label: "command palette (this)", hint: ":" },
    ],
  },
  {
    header: "agents · MCP · plugins · routes",
    commands: [
      { label: "registry · add CLI agent · set default", hint: ":agents" },
      { label: "per-agent MCP scope · probe · restart", hint: ":mcp" },
      { label: "per-agent plugin scope · enable / disable / update", hint: ":plugins" },
      { label: "default agent per action · run-time override", hint: ":routes" },
    ],
  },
  {
    header: "system",
    commands: [
      { label: "workspace · appearance · keyboard · privacy · account", hint: ":settings" },
      { label: "toggle theme", hint: ":set theme" },
      { label: "simple / pro mode", hint: ":mode" },
      { label: "keyboard cheatsheet", hint: "?" },
    ],
  },
];

/** How the palette was opened: fuzzy item picker, or the `:` ColonPalette. */
export type PaletteMode = "fuzzy" | "colon";

export interface PaletteOpts {
  width: number;
  height: number;
  items: string[];
  onAction?: (action: string) => void;
  /** Open mode. `"fuzzy"` (default) is the legacy item picker; `"colon"` is
   *  the CLI-grammar ColonPalette with OD section structure. */
  mode?: PaletteMode;
}

export class Palette {
  private readonly width: number;
  private readonly height: number;
  private readonly items: string[];
  private readonly onAction?: (action: string) => void;
  private readonly mode: PaletteMode;

  private query = "";
  private _isOpen = false;
  private _selectedIdx = 0;

  constructor(opts: PaletteOpts) {
    this.width = opts.width;
    this.height = opts.height;
    this.items = opts.items;
    this.onAction = opts.onAction;
    this.mode = opts.mode ?? "fuzzy";
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  /** Whether this palette is the CLI-grammar ColonPalette (`:`). */
  get isColonPalette(): boolean {
    return this.mode === "colon";
  }

  open(): void {
    this._isOpen = true;
    this.query = "";
    this._selectedIdx = 0;
  }

  close(): void {
    this._isOpen = false;
    this.query = "";
  }

  setQuery(q: string): void {
    this.query = q;
    this._selectedIdx = 0;
  }

  /** The current query text (without the leading `:` prompt glyph). */
  get currentQuery(): string {
    return this.query;
  }

  handleKey(key: string): void {
    if (key === "escape") {
      // Esc cancels the palette without running anything.
      this.close();
    } else if (key === "tab") {
      this.completeQuery();
    } else if (key === "enter") {
      this.selectCurrent();
    } else if (key === "up") {
      this._selectedIdx = Math.max(0, this._selectedIdx - 1);
    } else if (key === "down") {
      const max = this.candidateCount() - 1;
      this._selectedIdx = Math.min(max, this._selectedIdx + 1);
    }
  }

  private candidateCount(): number {
    return this.mode === "colon"
      ? this.colonCandidates().length
      : this.filteredItems().length;
  }

  /** Get filtered items based on current query (fuzzy mode). */
  filteredItems(): string[] {
    const q = this.query.trim();
    if (!q) return this.items;

    // Filter token: "kind:X" → items starting with "X."
    const kindMatch = q.match(/^kind:(\S+)$/);
    if (kindMatch) {
      const prefix = kindMatch[1]! + ".";
      return this.items.filter((item) => item.startsWith(prefix));
    }

    // Command mode: ">text" → strip > and fuzzy match
    const searchText = q.startsWith(">") ? q.slice(1) : q;

    // Fuzzy match: try sequential char match on item and on
    // reversed-segment form (e.g. "create-task" matches "task.create")
    return this.items.filter((item) => {
      const lower = item.toLowerCase();
      const needle = searchText.toLowerCase().replace(/-/g, "");
      // Also try reversed segments: "createtask" → try "task.create" form
      const reversedItem = lower.split(".").reverse().join("");
      return fuzzyMatch(needle, lower) || fuzzyMatch(needle, reversedItem);
    });
  }

  /**
   * The CLI-command completion candidates for the current `:` query
   * (ColonPalette mode). Empty query → every command verb.
   */
  colonCandidates(): string[] {
    return completeColonCommand(this.query);
  }

  /** Whether the current `:` query names a known CLI command. */
  hasKnownColonCommand(): boolean {
    return isKnownColonCommand(this.query);
  }

  /** Tab-complete the current query (ColonPalette mode only). */
  completeQuery(): void {
    if (this.mode !== "colon") return;
    const candidates = this.colonCandidates();
    const pick = candidates[this._selectedIdx] ?? candidates[0];
    if (pick) {
      this.query = pick;
      this._selectedIdx = 0;
    }
  }

  /** Select currently highlighted item, fire onAction. */
  selectCurrent(): void {
    if (this.mode === "colon") {
      const candidates = this.colonCandidates();
      const picked = candidates[this._selectedIdx];
      // Only fire on a known command: Enter never runs an unknown command.
      const command = picked ?? (this.hasKnownColonCommand() ? this.query.trim() : undefined);
      if (command && this.onAction) this.onAction(command);
      return;
    }
    const matches = this.filteredItems();
    const item = matches[this._selectedIdx];
    if (item && this.onAction) {
      this.onAction(item);
    }
  }

  /** Render palette overlay as lines. */
  render(): string[] {
    if (!this._isOpen) return [];
    return this.mode === "colon" ? this.renderColon() : this.renderFuzzy();
  }

  /** Legacy fuzzy-picker render (`> query` prompt + filtered item rows). */
  private renderFuzzy(): string[] {
    const lines: string[] = [];
    const inner = this.width - 4;
    lines.push("┌" + "─".repeat(inner + 2) + "┐");
    lines.push("│ " + pc.bold("> " + this.query).padEnd(inner) + " │");
    lines.push("│" + "─".repeat(inner + 2) + "│");

    const matches = this.filteredItems();
    const maxVisible = Math.min(matches.length, this.height - 6);
    for (let i = 0; i < maxVisible; i++) {
      const item = matches[i]!;
      const prefix = i === this._selectedIdx ? pc.cyan("▸ ") : "  ";
      const text = (prefix + item).slice(0, inner);
      lines.push("│ " + text.padEnd(inner) + " │");
    }

    lines.push("└" + "─".repeat(inner + 2) + "┘");
    return lines;
  }

  /**
   * ColonPalette render: the OD `tui-runs.html` palette: a `›` prompt line,
   * then the five OD sections (stages · step actions · search ·
   * agents/MCP/plugins/routes · system). When the query is non-empty the
   * CLI-command completion candidates replace the section list so
   * tab-completion is visible.
   */
  private renderColon(): string[] {
    const lines: string[] = [];
    const inner = this.width - 4;
    const clip = (s: string): string => s.slice(0, inner).padEnd(inner);

    lines.push("┌" + "─".repeat(inner + 2) + "┐");
    lines.push("│ " + clip(pc.dim("── palette · type to filter ──")) + " │");
    lines.push("│ " + clip(pc.cyan("› ") + this.query) + " │");
    lines.push("│" + "─".repeat(inner + 2) + "│");

    const budget = this.height - 6;
    if (this.query.trim().length > 0) {
      // Show CLI-command completion candidates for the typed query.
      const candidates = this.colonCandidates();
      const maxVisible = Math.min(candidates.length, budget);
      for (let i = 0; i < maxVisible; i++) {
        const cmd = candidates[i]!;
        const prefix = i === this._selectedIdx ? pc.cyan("▸ ") : "  ";
        lines.push("│ " + clip(prefix + ":" + cmd) + " │");
      }
      if (candidates.length === 0) {
        lines.push("│ " + clip(pc.dim("  no matching command")) + " │");
      }
    } else {
      // Empty query: render the OD section structure.
      let used = 0;
      for (const section of PALETTE_SECTIONS) {
        if (used >= budget) break;
        lines.push("│ " + clip(pc.dim("── " + section.header + " ───")) + " │");
        used++;
        for (const cmd of section.commands) {
          if (used >= budget) break;
          const hintCol = cmd.hint.padStart(8);
          const label = cmd.label.slice(0, Math.max(0, inner - hintCol.length - 3));
          lines.push("│ " + clip("  " + label + " " + pc.dim(hintCol)) + " │");
          used++;
        }
      }
    }

    lines.push("└" + "─".repeat(inner + 2) + "┘");
    return lines;
  }
}
