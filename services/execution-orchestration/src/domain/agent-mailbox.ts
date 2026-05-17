/**
 * Agent Mailbox — inter-agent message primitive for handoff/escalation.
 *
 * Each agent run gets a mailbox. Agents can send messages to other agent runs
 * by target run ID or by query (e.g. "the agent working on task X"). Messages
 * are persisted and delivered on next poll or push.
 */

export interface AgentMessage {
  id: string;
  fromRunId: string;
  fromAgent: string;
  toRunId: string;
  toAgent: string;
  kind: "handoff" | "escalation" | "info" | "blocked" | "completed";
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
  sentAt: Date;
  readAt: Date | null;
}

export interface MailboxQuery {
  runId?: string;
  agent?: string;
  taskId?: string;
  kind?: AgentMessage["kind"];
  unreadOnly?: boolean;
}

export function createMessage(input: {
  fromRunId: string;
  fromAgent: string;
  toRunId: string;
  toAgent: string;
  kind: AgentMessage["kind"];
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}): AgentMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...input,
    sentAt: new Date(),
    readAt: null,
  };
}

export function markRead(message: AgentMessage): AgentMessage {
  return { ...message, readAt: new Date() };
}

export function filterMessages(messages: AgentMessage[], query: MailboxQuery): AgentMessage[] {
  return messages.filter((m) => {
    if (query.runId && m.toRunId !== query.runId) return false;
    if (query.agent && m.toAgent !== query.agent) return false;
    if (query.kind && m.kind !== query.kind) return false;
    if (query.unreadOnly && m.readAt !== null) return false;
    return true;
  });
}
