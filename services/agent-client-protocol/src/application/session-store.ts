import type {
  ChatMessage,
  ModelInfo,
  PermissionRequest,
  SavedSession,
  SessionMode,
  SessionNotification,
  SlashCommand,
  ToolCallInfo,
} from "@agent-client-protocol/domain/protocol.ts";

export interface AcpSessionStateOptions {
  createId?: () => string;
  now?: () => number;
}

export interface AcpSessionState {
  savedSessions: SavedSession[];
  currentSession: SavedSession | null;
  messages: ChatMessage[];
  toolCalls: Map<string, ToolCallInfo>;
  isConnected: boolean;
  isLoading: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  isPaused: boolean;
  reconnectAttempts: number;
  reconnectMaxAttempts: number;
  error: string | null;
  pendingPermission: PermissionRequest | null;
  availableModes: SessionMode[];
  currentModeId: string;
  availableCommands: SlashCommand[];
  availableModels: ModelInfo[];
  currentModelId: string;
  startupPhase: string;
  startupLogs: string[];
  startupElapsed: number;
  readonly hasActiveSession: boolean;
  readonly messageList: ChatMessage[];
  readonly toolCallList: ToolCallInfo[];
  readonly resumableSessions: SavedSession[];
  createId(): string;
  now(): number;
  disconnectState(): void;
  clearError(): void;
}

class MutableAcpSessionState implements AcpSessionState {
  savedSessions: SavedSession[] = [];
  currentSession: SavedSession | null = null;
  messages: ChatMessage[] = [];
  toolCalls = new Map<string, ToolCallInfo>();
  isConnected = false;
  isLoading = false;
  isConnecting = false;
  isReconnecting = false;
  isPaused = false;
  reconnectAttempts = 0;
  reconnectMaxAttempts = 3;
  error: string | null = null;
  pendingPermission: PermissionRequest | null = null;
  availableModes: SessionMode[] = [];
  currentModeId = "";
  availableCommands: SlashCommand[] = [];
  availableModels: ModelInfo[] = [];
  currentModelId = "";
  startupPhase = "starting";
  startupLogs: string[] = [];
  startupElapsed = 0;
  private readonly createIdFn: () => string;
  private readonly nowFn: () => number;

  constructor(options: AcpSessionStateOptions = {}) {
    this.createIdFn = options.createId ?? (() => crypto.randomUUID());
    this.nowFn = options.now ?? Date.now;
  }

  get hasActiveSession(): boolean {
    return this.currentSession !== null;
  }

  get messageList(): ChatMessage[] {
    return this.messages;
  }

  get toolCallList(): ToolCallInfo[] {
    return Array.from(this.toolCalls.values());
  }

  get resumableSessions(): SavedSession[] {
    return this.savedSessions.filter((session) => session.supportsLoadSession === true);
  }

  createId(): string {
    return this.createIdFn();
  }

  now(): number {
    return this.nowFn();
  }

  disconnectState(): void {
    this.currentSession = null;
    this.isConnected = false;
    this.isPaused = false;
    this.messages = [];
    this.toolCalls.clear();
    this.availableModes = [];
    this.currentModeId = "";
    this.availableCommands = [];
    this.availableModels = [];
    this.currentModelId = "";
    this.pendingPermission = null;
  }

  clearError(): void {
    this.error = null;
  }
}

export function createAcpSessionState(options: AcpSessionStateOptions = {}): AcpSessionState {
  return new MutableAcpSessionState(options);
}

export function detectStartupPhase(line: string): string | null {
  const lower = line.toLowerCase();
  if (lower.includes("download") || lower.includes("fetch") || lower.includes("get ")) return "downloading";
  if (lower.includes("install") || lower.includes("added") || lower.includes("packages")) return "installing";
  if (lower.includes("build") || lower.includes("compil")) return "building";
  if (lower.includes("start") || lower.includes("spawn")) return "starting";
  return null;
}

export function applySessionNotification(state: AcpSessionState, notification: SessionNotification): void {
  const update = toRecord(notification.update);
  const sessionUpdate = stringValue(update.sessionUpdate);
  switch (sessionUpdate) {
    case "user_message_chunk":
      applyUserMessageChunk(state, textContent(update.content));
      break;
    case "agent_message_chunk":
      applyAgentMessageChunk(state, textContent(update.content));
      break;
    case "agent_thought_chunk":
      applyAgentThoughtChunk(state, textContent(update.content));
      break;
    case "tool_call":
      applyToolCall(state, update);
      break;
    case "tool_call_update":
      applyToolCallUpdate(state, update);
      break;
    case "current_mode_update":
      if (typeof update.modeId === "string") state.currentModeId = update.modeId;
      break;
    case "available_commands_update":
      state.availableCommands = commandsFromUnknown(update.availableCommands);
      break;
  }
}

function applyUserMessageChunk(state: AcpSessionState, text: string): void {
  const last = state.messages.at(-1);
  if (last?.role === "user") {
    last.content += text;
    return;
  }
  state.messages.push({
    id: state.createId(),
    role: "user",
    content: text,
    timestamp: state.now(),
  });
}

function applyAgentMessageChunk(state: AcpSessionState, text: string): void {
  const last = state.messages.at(-1);
  if (last?.role === "assistant") {
    last.content += text;
    return;
  }
  state.messages.push({
    id: state.createId(),
    role: "assistant",
    content: text,
    timestamp: state.now(),
    toolCalls: [],
  });
}

function applyAgentThoughtChunk(state: AcpSessionState, text: string): void {
  const last = state.messages.at(-1);
  if (last?.role === "assistant") {
    last.thought = `${last.thought ?? ""}${text}`;
    return;
  }
  state.messages.push({
    id: state.createId(),
    role: "assistant",
    content: "",
    thought: text,
    timestamp: state.now(),
    toolCalls: [],
  });
}

function applyToolCall(state: AcpSessionState, update: Record<string, unknown>): void {
  const toolCallId = stringValue(update.toolCallId);
  if (!toolCallId) return;
  const toolCall: ToolCallInfo = {
    toolCallId,
    title: stringValue(update.title),
    kind: stringValue(update.kind) || "other",
    status: toolStatus(update.status),
    args: update.args ?? update.input,
    result: update.result,
    errorMessage: optionalString(update.errorMessage) ?? optionalString(update.error),
    locations: locationsFromUnknown(update.locations),
  };
  const last = state.messages.at(-1);
  if (last?.role === "assistant") {
    if (!last.toolCalls) last.toolCalls = [];
    last.toolCalls.push({ ...toolCall, locations: toolCall.locations });
  }
  state.toolCalls.set(toolCallId, toolCall);
}

function applyToolCallUpdate(state: AcpSessionState, update: Record<string, unknown>): void {
  const toolCallId = stringValue(update.toolCallId);
  if (!toolCallId) return;
  const existing = state.toolCalls.get(toolCallId);
  if (existing) {
    if (typeof update.status === "string") existing.status = toolStatus(update.status);
    if (typeof update.title === "string") existing.title = update.title;
    if ("args" in update || "input" in update) existing.args = update.args ?? update.input;
    if ("result" in update) existing.result = update.result;
    if (typeof update.errorMessage === "string") existing.errorMessage = update.errorMessage;
    if (typeof update.error === "string") existing.errorMessage = update.error;
  }
  for (const message of state.messages) {
    for (const toolCall of message.toolCalls ?? []) {
      if (toolCall.toolCallId !== toolCallId) continue;
      if (typeof update.status === "string") toolCall.status = toolStatus(update.status);
      if (typeof update.title === "string") toolCall.title = update.title;
      if ("args" in update || "input" in update) toolCall.args = update.args ?? update.input;
      if ("result" in update) toolCall.result = update.result;
      if (typeof update.errorMessage === "string") toolCall.errorMessage = update.errorMessage;
      if (typeof update.error === "string") toolCall.errorMessage = update.error;
    }
  }
}

function commandsFromUnknown(value: unknown): SlashCommand[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const command = toRecord(candidate);
    const name = stringValue(command.name);
    const description = stringValue(command.description);
    if (!name || !description) return [];
    const input = toRecord(command.input);
    return [{ name, description, hint: typeof input.hint === "string" ? input.hint : undefined }];
  });
}

function textContent(value: unknown): string {
  const content = toRecord(value);
  if (content.type === "text" && typeof content.text === "string") return content.text;
  return "";
}

function locationsFromUnknown(value: unknown): { path: string }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const locations = value.flatMap((candidate) => {
    const location = toRecord(candidate);
    return typeof location.path === "string" ? [{ path: location.path }] : [];
  });
  return locations.length > 0 ? locations : undefined;
}

function toolStatus(value: unknown): ToolCallInfo["status"] {
  return value === "pending" || value === "in_progress" || value === "completed" || value === "failed" ? value : "pending";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
