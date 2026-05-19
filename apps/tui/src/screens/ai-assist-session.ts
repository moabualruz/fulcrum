import type { TaskAiAssistSessionInput } from "@agent-client-protocol/application/task-ai-assist-session.ts";
import { startTaskAiAssistSession } from "@agent-client-protocol/application/task-ai-assist-session.ts";

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
