/**
 * AI Assist session screens — the TUI surface for AI Assist.
 *
 * Two distinct surfaces live here:
 *
 *  1. `renderTaskAiAssistStartScreen` — the `:ai start <task-id>` task-scoped
 *     dispatch screen (`AiAssistTaskStartScreen` in apps/tui/CONTEXT.md): shows
 *     task title, agent, route, workspace path, context bundle summary, and the
 *     returned session id.
 *  2. `createInlineAiAssistPane` — the TUI-native inline `:ai` AI Assist pane
 *     (`ChatPane` in apps/tui/CONTEXT.md, CLI-TUI-UX.md §6/§6.1/§7.5/§10). This
 *     is the first-class inline screen reachable three ways — `:ai` colon
 *     route, `:ai` tab, and the footer `[ :ai ]` segment — with a thread
 *     transcript, composer, agent picker, project/step/trace scope, and inline
 *     permission prompts. It is a screen swap, NOT a web-style overlay drawer
 *     (CLI-TUI-UX.md §6.1).
 *
 * Both keep the copy as "AI Assist" instead of the raw protocol acronym.
 */

import type { TaskAiAssistSessionInput } from "@agent-client-protocol/application/task-ai-assist-session.ts";
import { startTaskAiAssistSession } from "@agent-client-protocol/application/task-ai-assist-session.ts";

import { ChatPaneScreen, type ChatPaneScreenOptions } from "./chat-pane.ts";
import type { ChatScope } from "../widgets/ChatPane.ts";

export { ChatPaneScreen, CHAT_PANE_FOOTER_MODE } from "./chat-pane.ts";
export type { ChatPaneCaller, ChatPaneReply, ChatPaneScreenOptions } from "./chat-pane.ts";

/**
 * Render the `:ai start <task-id>` task-scoped AI Assist start screen — the
 * `AiAssistTaskStartScreen` TuiScreen. Unchanged contract: task title, agent,
 * route, workspace path, context bundle summary, session id, footer hint.
 */
export function renderTaskAiAssistStartScreen(input: TaskAiAssistSessionInput): string {
  const session = startTaskAiAssistSession(input);
  return [
    "AI Assist",
    "",
    `Task: ${session.taskTitle}`,
    `Agent: ${session.agent}`,
    `Route: ${session.route}`,
    `Workspace: ${session.workspacePath}`,
    `Context: ${session.contextBundle.summary}`,
    `Session: ${session.sessionId}`,
    "",
    ":ai start <task-id>  Enter start  Esc back",
  ].join("\n");
}

/**
 * Build the TUI-native inline `:ai` AI Assist pane (`ChatPane` screen). The
 * root launcher constructs this once and reuses it across screen navigation so
 * thread state survives a screen swap (CLI-TUI-UX.md §10.3). The pane
 * auto-scopes to the supplied project + active step + last trace.
 */
export function createInlineAiAssistPane(opts: ChatPaneScreenOptions): ChatPaneScreen {
  return new ChatPaneScreen(opts);
}

/** Default auto-scope for the inline `:ai` pane when no step is active (§10.3). */
export function defaultAiAssistScope(project: string, traceId: string | null): ChatScope {
  return { project, step: null, traceId };
}
