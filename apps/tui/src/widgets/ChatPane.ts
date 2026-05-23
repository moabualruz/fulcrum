/**
 * ChatPane widget: the TUI-native inline AI Assist pane (CLI-TUI-UX.md §10).
 *
 * This is the terminal-side equivalent of the web AI Assist drawer, but it is
 * NOT a drawer: the web shell slides AI Assist in from the right (Cloudflare AI
 * Assist pattern); the TUI keeps the terminal a terminal and renders AI Assist
 * as a first-class inline `:ai` screen reached via screen swap (CLI-TUI-UX.md
 * §6.1, §10). This widget owns the *content* of that screen: thread transcript,
 * composer, agent label, project/step/trace scope, and inline permission
 * prompts: while `screens/chat-pane.ts` owns the screen wrapper and keyboard
 * map (§7.5).
 *
 * The pane auto-scopes to the active project + active step + last-visited trace
 * id (CLI-TUI-UX.md §10.3) and the same `ChatPane` instance is reused across
 * screen navigation so thread state (transcript + composer draft + history)
 * survives a screen swap and reopens with the last thread.
 *
 * Layout target: the canonical ASCII block in CLI-TUI-UX.md §10.2: a header
 * line carrying `:ai` + agent, a `thread · <name>` rule, the transcript
 * (`you`/`agent` turns, tool-call rows, diff hunks, inline permission prompts),
 * a `composer` rule, the `› ` input line, and the composer hint
 * (`@scope mention · /cmd slash · ⌘↵ run · ⌘s save thread`).
 */

import { c, hRule } from "../renderer.ts";

/** Speaker of a transcript turn: `you` or the routed agent. */
export type ChatTurnSpeaker = "you" | "agent";

/** One tool-call row inside an agent turn (`▸ read_file … · 0–240   done`). */
export interface ChatToolCall {
  /** Tool name, e.g. `read_file`, `edit_file`, `shell.run`. */
  tool: string;
  /** Short detail string, e.g. `src/auth/session.ts · 0–240`. */
  detail: string;
  /** Tool-call lifecycle state rendered right-aligned in the row. */
  state: "running" | "done" | "failed";
  /** Optional diff hunk lines rendered below the tool row (CLI-TUI-UX.md §10.2). */
  diff?: readonly string[];
}

/** A pending permission prompt rendered inline in the transcript (§10.2). */
export interface ChatPermissionPrompt {
  /** Stable id so a decision can be matched back to its prompt. */
  id: string;
  /** Capability the agent is requesting, e.g. `shell.run`. */
  capability: string;
  /** Human-readable command/argument the capability would execute. */
  command: string;
}

/** Operator decision on a permission prompt (CLI-TUI-UX.md §10.2 actions). */
export type ChatPermissionDecision = "allow-once" | "deny" | "always-allow";

/** One transcript turn: a `you` message or an `agent` reply with tool calls. */
export interface ChatTurn {
  speaker: ChatTurnSpeaker;
  /** Wall-clock `HH:MM` stamp rendered beside the speaker label. */
  time: string;
  /** Message body lines (already wrapped by the caller / service). */
  lines: readonly string[];
  /** Tool calls produced by an agent turn (empty for a `you` turn). */
  toolCalls?: readonly ChatToolCall[];
  /** Permission prompt raised by this agent turn, awaiting a decision. */
  permission?: ChatPermissionPrompt;
}

/** The active project/step/trace scope the pane is bound to (§10.3). */
export interface ChatScope {
  /** Active project slug, e.g. `auth/rewrite`. */
  project: string;
  /** Active step label, e.g. `Step 3 / 8 · Persist issuance row`, or null. */
  step: string | null;
  /** Last-visited trace id (yank-able via `y t`), or null. */
  traceId: string | null;
}

/** Construction input for a `ChatPane`. */
export interface ChatPaneOptions {
  /** Thread name rendered in the `thread · <name>` rule. */
  threadName: string;
  /** Routed agent id (CLI-TUI-UX.md §10.4): overridable per-turn. */
  agent: string;
  /** Initial scope; updated as the operator navigates between screens. */
  scope: ChatScope;
  /** Optional seed transcript so the pane reopens with the last thread. */
  transcript?: readonly ChatTurn[];
}

/** Composer hint copy: locked verbatim by CLI-TUI-UX.md §10.2. */
export const COMPOSER_HINT = "@scope mention · /cmd slash · ⌘↵ run · ⌘s save thread";

/**
 * ChatPane: owns the thread transcript, composer draft, submit history, agent
 * label, and scope of the inline `:ai` AI Assist pane. It is render-pure: it
 * produces an array of plain text lines so both the 80×24 and 120×32 snapshot
 * tests can lock the exact layout, and the OpenTUI adapter can paint the same
 * lines at runtime.
 */
export class ChatPane {
  private threadName: string;
  private agent: string;
  private scope: ChatScope;
  private readonly transcript: ChatTurn[];
  /** Current composer draft (the text after `› `). */
  private draft = "";
  /** Submitted-message history for `↑`/`↓` recall (CLI-TUI-UX.md §7.5). */
  private readonly history: string[] = [];
  /** Cursor into `history`; -1 means "editing a fresh draft". */
  private historyCursor = -1;

  constructor(opts: ChatPaneOptions) {
    this.threadName = opts.threadName;
    this.agent = opts.agent;
    this.scope = { ...opts.scope };
    this.transcript = opts.transcript ? [...opts.transcript] : [];
  }

  // ── Scope ──────────────────────────────────────────────────────────────────

  /** Re-scope the pane as the operator navigates (§10.3: scope follows nav). */
  setScope(scope: ChatScope): void {
    this.scope = { ...scope };
  }

  /** Current scope: read by the footer + trace yank. */
  get currentScope(): ChatScope {
    return { ...this.scope };
  }

  // ── Agent selection (§10.4) ────────────────────────────────────────────────

  /** Routed/overridden agent id rendered in the header (`agent: <id>`). */
  get currentAgent(): string {
    return this.agent;
  }

  /** Override the agent for this thread (`:agent <id>` typed in the composer). */
  setAgent(agent: string): void {
    this.agent = agent;
  }

  // ── Composer ───────────────────────────────────────────────────────────────

  /** Append typed text to the composer draft. */
  appendToComposer(text: string): void {
    this.draft += text;
    this.historyCursor = -1;
  }

  /** Backspace one character from the composer draft. */
  backspaceComposer(): void {
    this.draft = this.draft.slice(0, -1);
    this.historyCursor = -1;
  }

  /** Clear the composer draft (`Ctrl-l`, CLI-TUI-UX.md §7.5). */
  clearComposer(): void {
    this.draft = "";
    this.historyCursor = -1;
  }

  /** Current composer draft text (the part after the `› ` prompt). */
  get composerDraft(): string {
    return this.draft;
  }

  /** Recall a previous/next submitted message (`↑`/`↓`, CLI-TUI-UX.md §7.5). */
  recallHistory(direction: -1 | 1): void {
    if (this.history.length === 0) return;
    if (direction === -1) {
      this.historyCursor =
        this.historyCursor === -1
          ? this.history.length - 1
          : Math.max(0, this.historyCursor - 1);
    } else {
      if (this.historyCursor === -1) return;
      this.historyCursor += 1;
      if (this.historyCursor >= this.history.length) {
        this.historyCursor = -1;
        this.draft = "";
        return;
      }
    }
    this.draft = this.history[this.historyCursor] ?? "";
  }

  /**
   * Submit the current composer draft as a `you` turn. A leading `:agent <id>`
   * is treated as an agent override (§10.4) and does not become a message.
   * Returns the submitted text, or null when the draft was empty / consumed as
   * a command.
   */
  submit(time: string): string | null {
    const text = this.draft.trim();
    this.draft = "";
    this.historyCursor = -1;
    if (text.length === 0) return null;
    const agentMatch = /^:agent\s+(\S+)$/.exec(text);
    if (agentMatch?.[1]) {
      this.setAgent(agentMatch[1]);
      return null;
    }
    this.history.push(text);
    this.transcript.push({ speaker: "you", time, lines: [text] });
    return text;
  }

  // ── Permission prompts (§10.2) ─────────────────────────────────────────────

  /** The oldest still-pending permission prompt, or null when none is open. */
  get pendingPermission(): ChatPermissionPrompt | null {
    for (const turn of this.transcript) {
      if (turn.permission) return turn.permission;
    }
    return null;
  }

  /**
   * Resolve a pending permission prompt by id. Returns the decision so the
   * caller can dispatch it to the agent service; clears the prompt from the
   * transcript turn that raised it.
   */
  resolvePermission(id: string, decision: ChatPermissionDecision): ChatPermissionDecision | null {
    for (const turn of this.transcript) {
      if (turn.permission?.id === id) {
        delete (turn as { permission?: ChatPermissionPrompt }).permission;
        return decision;
      }
    }
    return null;
  }

  // ── Transcript ─────────────────────────────────────────────────────────────

  /** All transcript turns (read-only): exposed for tests + thread snapshot. */
  get turns(): readonly ChatTurn[] {
    return this.transcript;
  }

  /** Append an agent turn (tool calls, diff, permission prompt) to the thread. */
  appendAgentTurn(turn: Omit<ChatTurn, "speaker">): void {
    this.transcript.push({ ...turn, speaker: "agent" });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  /**
   * Render the pane body as plain text lines for the given terminal width.
   * Matches the CLI-TUI-UX.md §10.2 layout: header → thread rule → transcript
   * → composer rule → `› ` input → composer hint. The screen wrapper adds the
   * status footer; this method renders only the pane content.
   */
  render(width: number): string[] {
    const inner = Math.max(20, width);
    const lines: string[] = [];

    // Header: `:ai · inline AI pane` on the left, routed agent on the right.
    lines.push(
      c.bold(`  fulcrum · :ai · inline AI pane (TUI-native)`) + `   agent: ${this.agent}`,
    );
    // Scope line: project · step · trace (CLI-TUI-UX.md §10.3 auto-scope).
    const step = this.scope.step ?? "no active step";
    const trace = this.scope.traceId ?? "-";
    lines.push(c.dim(`  scope: ${this.scope.project} · ${step} · trace:${trace}`));

    // Thread rule.
    lines.push(c.dim(`  ─── thread · ${this.threadName} ${hRule(Math.max(0, inner - this.threadName.length - 16), "─")}`));
    lines.push("");

    if (this.transcript.length === 0) {
      // Empty-state: one sentence + one action (CLI-TUI-UX.md §5 contract).
      lines.push(c.dim("  No messages yet. Type a request below and press Enter to ask the agent."));
      lines.push("");
    } else {
      for (const turn of this.transcript) {
        lines.push(...this.renderTurn(turn));
      }
    }

    // Composer. The prefix `  ─── composer ` is 15 columns wide; the rule
    // fills the remainder so the line lands exactly at the terminal width.
    lines.push(c.dim(`  ─── composer ${hRule(Math.max(0, inner - 15), "─")}`));
    lines.push(`  › ${this.draft}`);
    lines.push(c.dim(`  ${COMPOSER_HINT}`));

    return lines;
  }

  /** Render a single transcript turn (speaker line + body + tool calls). */
  private renderTurn(turn: ChatTurn): string[] {
    const out: string[] = [];
    out.push(`  ${c.bold(turn.speaker)} ${c.dim(turn.time)}`);
    for (const line of turn.lines) {
      out.push(`    ${line}`);
    }
    for (const call of turn.toolCalls ?? []) {
      const glyph = call.state === "failed" ? "✗" : call.state === "running" ? "●" : "▸";
      out.push(`    ${glyph} ${call.tool} ${call.detail}   ${c.dim(call.state)}`);
      for (const diffLine of call.diff ?? []) {
        out.push(`        ${diffLine}`);
      }
    }
    if (turn.permission) {
      out.push(`    ⚠ permission ${turn.permission.capability}  ${turn.permission.command}`);
      out.push(
        `      [ Allow once ]  [ Deny ]  [ Always allow ${turn.permission.capability} ]`,
      );
    }
    out.push("");
    return out;
  }
}
