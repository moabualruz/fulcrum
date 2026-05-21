/**
 * ChatPaneScreen: the TUI-native inline `:ai` AI Assist pane screen
 * (CLI-TUI-UX.md §6 `:ai` row, §6.1, §7.5 pane keys, §10 layout).
 *
 * This screen is the terminal-side parity for the web AI Assist drawer
 * (`prd-web-global-ai-assist-drawer`) and the CLI step-scope command
 * (`prd-cli-ai-assist-step-scope`). It is NOT a drawer: the web slides AI
 * Assist in as an overlay; the TUI keeps the terminal a terminal and renders
 * AI Assist as a first-class inline screen reached by a screen swap
 * (CLI-TUI-UX.md §6.1). Invoking `:ai` (colon route, `:ai` tab, or footer
 * `[ :ai ]` segment) swaps the visible screen to this one and flips the
 * status-footer mode pill to `:AI`; `q` pops back to the previous screen.
 *
 * Responsibilities:
 *  - Own the `ChatPane` widget (transcript + composer + agent + scope).
 *  - Implement the §7.5 AI Assist pane keymap: `Enter` submit,
 *    `Shift+Enter` newline, `↑`/`↓` history, `Ctrl-l` clear, `Ctrl-s` save
 *    thread, `Esc` blur, `q` pop back.
 *  - Render the §10.2 pane layout at 80×24 and 120×32 (snapshot-fidelity).
 *  - Preserve thread state across screen navigation: the same screen
 *    instance is reused so the transcript and composer draft survive a swap.
 *
 * The screen delegates message dispatch and permission decisions to a
 * `ChatPaneCaller` boundary so tests exercise the full keyboard path without a
 * Nest/TypeORM agent runtime.
 */

import type { Renderer } from "../renderer.ts";
import {
  ChatPane,
  type ChatPermissionDecision,
  type ChatScope,
  type ChatToolCall,
} from "../widgets/ChatPane.ts";

/** Footer mode label rendered while the `:ai` pane is focused (§10.1). */
export const CHAT_PANE_FOOTER_MODE = ":AI";

/** Agent reply returned by the caller after a submitted message. */
export interface ChatPaneReply {
  /** Wall-clock `HH:MM` stamp for the agent turn. */
  time: string;
  /** Reply body lines. */
  lines: readonly string[];
  /** Tool calls the agent ran for this reply. */
  toolCalls?: readonly ChatToolCall[];
  /** Permission prompt the agent raised, awaiting an operator decision. */
  permission?: { id: string; capability: string; command: string };
}

/** Service boundary the `:ai` pane dispatches against. */
export interface ChatPaneCaller {
  /** Send a `you` message; resolves with the agent reply turn. */
  sendMessage(input: { message: string; agent: string; scope: ChatScope }): Promise<ChatPaneReply>;
  /** Resolve a permission prompt with the operator's decision. */
  resolvePermission(input: { promptId: string; decision: ChatPermissionDecision }): Promise<void>;
  /** Persist the current thread as a reusable prompt template (`Ctrl-s`). */
  saveThread(input: { threadName: string }): Promise<void>;
}

/** Construction input for the `:ai` ChatPaneScreen. */
export interface ChatPaneScreenOptions {
  caller: ChatPaneCaller;
  /** Thread name (CLI-TUI-UX.md §10.3: reopens with the last thread). */
  threadName?: string;
  /** Routed agent id (CLI-TUI-UX.md §10.4). */
  agent?: string;
  /** Initial auto-scope (project + active step + last trace, §10.3). */
  scope?: ChatScope;
}

/** Wall-clock `HH:MM` used when the caller does not stamp a turn. */
function clock(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export class ChatPaneScreen {
  /** The thread/composer/scope state: survives screen navigation. */
  readonly pane: ChatPane;
  private readonly caller: ChatPaneCaller;
  private readonly threadName: string;
  /** Transient one-line status flashed below the composer hint. */
  private flash: string | null = null;
  /** True while the composer input has focus (`Esc` blurs it). */
  private composerFocused = true;

  constructor(opts: ChatPaneScreenOptions) {
    this.caller = opts.caller;
    this.threadName = opts.threadName ?? "ai-assist";
    this.pane = new ChatPane({
      threadName: this.threadName,
      agent: opts.agent ?? "claude-opus-4-7",
      scope: opts.scope ?? { project: "fulcrum", step: null, traceId: null },
    });
  }

  /** Re-scope the pane as the operator navigates between screens (§10.3). */
  rescope(scope: ChatScope): void {
    this.pane.setScope(scope);
  }

  /** Whether the composer currently has focus. */
  get isComposerFocused(): boolean {
    return this.composerFocused;
  }

  /** Current transient status line (test helper). */
  get currentFlash(): string | null {
    return this.flash;
  }

  // ── §7.5 AI Assist pane keymap ──────────────────────────────────────────────

  /** Type printable text into the composer. */
  type(text: string): void {
    if (!this.composerFocused) this.composerFocused = true;
    this.pane.appendToComposer(text);
  }

  /** Backspace one character from the composer draft. */
  backspace(): void {
    this.pane.backspaceComposer();
  }

  /** `Shift+Enter`: insert a newline into the composer without submitting. */
  newline(): void {
    this.pane.appendToComposer("\n");
  }

  /** `↑`/`↓`: recall previous / next submitted message. */
  history(direction: -1 | 1): void {
    this.pane.recallHistory(direction);
  }

  /** `Ctrl-l`: clear the composer draft. */
  clearComposer(): void {
    this.pane.clearComposer();
    this.flash = "Composer cleared.";
  }

  /** `Esc`: blur the composer (keeps the thread; does not pop the screen). */
  blur(): void {
    this.composerFocused = false;
  }

  /** `Enter`: submit the composer draft and stream the agent reply. */
  async submit(): Promise<void> {
    const message = this.pane.submit(clock());
    if (message === null) {
      // Empty draft, or an inline `:agent <id>` override was consumed.
      this.flash = null;
      return;
    }
    this.flash = "Sent.";
    const reply = await this.caller.sendMessage({
      message,
      agent: this.pane.currentAgent,
      scope: this.pane.currentScope,
    });
    this.pane.appendAgentTurn({
      time: reply.time,
      lines: reply.lines,
      toolCalls: reply.toolCalls,
      permission: reply.permission,
    });
  }

  /** `Ctrl-s`: save the current thread as a reusable prompt template. */
  async saveThread(): Promise<void> {
    await this.caller.saveThread({ threadName: this.threadName });
    this.flash = "Thread saved.";
  }

  /** Resolve a pending inline permission prompt (CLI-TUI-UX.md §10.2). */
  async decidePermission(decision: ChatPermissionDecision): Promise<void> {
    const prompt = this.pane.pendingPermission;
    if (!prompt) return;
    const resolved = this.pane.resolvePermission(prompt.id, decision);
    if (!resolved) return;
    await this.caller.resolvePermission({ promptId: prompt.id, decision: resolved });
    this.flash =
      decision === "deny"
        ? `Denied ${prompt.capability}.`
        : decision === "always-allow"
          ? `Always allow ${prompt.capability}.`
          : `Allowed ${prompt.capability} once.`;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  /**
   * Render the `:ai` pane into the renderer. Produces the §10.2 layout: header,
   * scope line, thread rule, transcript, composer rule, `› ` input, hint. The
   * caller renders the status footer separately with the mode pill flipped to
   * `:AI` (`CHAT_PANE_FOOTER_MODE`).
   */
  render(renderer: Renderer): void {
    for (const line of this.pane.render(renderer.width)) {
      renderer.writeln(line);
    }
    if (this.flash) {
      renderer.writeln(`  ${this.flash}`);
    }
  }
}
