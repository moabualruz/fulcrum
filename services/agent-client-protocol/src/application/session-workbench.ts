import type { AcpSessionState } from "@agent-client-protocol/application/session-store.ts";
import { createAcpSessionState } from "@agent-client-protocol/application/session-store.ts";
import type { AcpTrafficRecorder, TrafficEntry } from "@agent-client-protocol/application/traffic.ts";
import type {
  ChatMessage,
  ModelInfo,
  PermissionOption,
  PermissionRequest,
  SavedSession,
  SessionMode,
  ToolCallInfo,
} from "@agent-client-protocol/domain/protocol.ts";

export type SessionConnectionStatus = "idle" | "connecting" | "reconnecting" | "connected" | "error";

export interface SessionWorkbenchInput {
  state: AcpSessionState;
  traffic?: Pick<AcpTrafficRecorder, "entries" | "filteredEntries" | "isPaused" | "filter" | "searchQuery">;
}

export interface SessionWorkbenchModel {
  connection: {
    status: SessionConnectionStatus;
    busy: boolean;
    error: string | null;
    startup: {
      phase: string;
      elapsed: number;
      logs: string[];
    };
  };
  session: SessionWorkbenchSession | null;
  controls: {
    canPrompt: boolean;
    canCancel: boolean;
    canDisconnect: boolean;
    canResolvePermission: boolean;
    canChangeMode: boolean;
    canChangeModel: boolean;
    canResume: boolean;
  };
  modes: SessionWorkbenchMode[];
  models: SessionWorkbenchModelOption[];
  messages: ChatMessage[];
  toolCalls: {
    items: ToolCallInfo[];
    summary: ToolCallSummary;
  };
  permission: SessionWorkbenchPermission | null;
  traffic: {
    entries: TrafficEntry[];
    filteredEntries: TrafficEntry[];
    paused: boolean;
    filter: string;
    searchQuery: string;
    summary: TrafficSummary;
  };
  resumableSessions: SessionWorkbenchSession[];
}

export interface SessionWorkbenchSession {
  id: string;
  sessionId: string;
  title: string;
  agentName: string;
  cwd: string;
  lastUpdated: number;
  supportsResume: boolean;
}

export interface SessionWorkbenchMode extends SessionMode {
  selected: boolean;
}

export interface SessionWorkbenchModelOption extends ModelInfo {
  selected: boolean;
}

export interface SessionWorkbenchPermission {
  sessionId: string;
  toolCall: ToolCallInfo;
  options: PermissionOption[];
}

export interface ToolCallSummary {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
}

export interface TrafficSummary {
  total: number;
  requests: number;
  responses: number;
  notifications: number;
  errors: number;
}

const EMPTY_TRAFFIC = {
  entries: [] as TrafficEntry[],
  filteredEntries: [] as TrafficEntry[],
  isPaused: false,
  filter: "all",
  searchQuery: "",
};

export function buildSessionWorkbenchModel(input: SessionWorkbenchInput): SessionWorkbenchModel {
  const state = input.state;
  const traffic = input.traffic ?? EMPTY_TRAFFIC;
  const session = state.currentSession ? toWorkbenchSession(state.currentSession) : null;
  const pendingPermission = state.pendingPermission ? toWorkbenchPermission(state.pendingPermission) : null;
  const toolCalls = state.toolCallList.map(cloneToolCall);

  return {
    connection: {
      status: connectionStatus(state),
      busy: state.isLoading || state.isConnecting || state.isReconnecting,
      error: state.error,
      startup: {
        phase: state.startupPhase,
        elapsed: state.startupElapsed,
        logs: [...state.startupLogs],
      },
    },
    session,
    controls: {
      canPrompt: state.isConnected && session !== null,
      canCancel: state.isConnected && session !== null && state.isLoading,
      canDisconnect: state.isConnected && session !== null,
      canResolvePermission: pendingPermission !== null,
      canChangeMode: state.isConnected && session !== null && state.availableModes.length > 0,
      canChangeModel: state.isConnected && session !== null && state.availableModels.length > 0,
      canResume: state.resumableSessions.length > 0,
    },
    modes: state.availableModes.map((mode) => ({ ...mode, selected: mode.id === state.currentModeId })),
    models: state.availableModels.map((model) => ({ ...model, selected: model.modelId === state.currentModelId })),
    messages: state.messageList.map(cloneMessage),
    toolCalls: {
      items: toolCalls,
      summary: summarizeToolCalls(toolCalls),
    },
    permission: pendingPermission,
    traffic: {
      entries: [...traffic.entries],
      filteredEntries: [...traffic.filteredEntries],
      paused: traffic.isPaused,
      filter: traffic.filter,
      searchQuery: traffic.searchQuery,
      summary: summarizeTraffic(traffic.entries),
    },
    resumableSessions: state.resumableSessions.map(toWorkbenchSession),
  };
}

export function createIdleSessionWorkbenchModel(): SessionWorkbenchModel {
  return buildSessionWorkbenchModel({ state: createAcpSessionState() });
}

function connectionStatus(state: AcpSessionState): SessionConnectionStatus {
  if (state.error) return "error";
  if (state.isConnecting) return "connecting";
  if (state.isReconnecting) return "reconnecting";
  if (state.isConnected) return "connected";
  return "idle";
}

function toWorkbenchSession(session: SavedSession): SessionWorkbenchSession {
  return {
    id: session.id,
    sessionId: session.sessionId,
    title: session.title,
    agentName: session.agentName,
    cwd: session.cwd,
    lastUpdated: session.lastUpdated,
    supportsResume: session.supportsLoadSession === true,
  };
}

function toWorkbenchPermission(permission: PermissionRequest): SessionWorkbenchPermission {
  return {
    sessionId: permission.sessionId,
    toolCall: cloneToolCall(permission.toolCall),
    options: permission.options.map((option) => ({ ...option })),
  };
}

function cloneMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    toolCalls: message.toolCalls?.map(cloneToolCall),
  };
}

function cloneToolCall(toolCall: ToolCallInfo): ToolCallInfo {
  return {
    ...toolCall,
    locations: toolCall.locations?.map((location) => ({ ...location })),
  };
}

function summarizeToolCalls(toolCalls: ToolCallInfo[]): ToolCallSummary {
  const summary: ToolCallSummary = {
    total: toolCalls.length,
    pending: 0,
    inProgress: 0,
    completed: 0,
    failed: 0,
  };
  for (const toolCall of toolCalls) {
    switch (toolCall.status) {
      case "pending":
        summary.pending += 1;
        break;
      case "in_progress":
        summary.inProgress += 1;
        break;
      case "completed":
        summary.completed += 1;
        break;
      case "failed":
        summary.failed += 1;
        break;
    }
  }
  return summary;
}

function summarizeTraffic(entries: TrafficEntry[]): TrafficSummary {
  const summary: TrafficSummary = {
    total: entries.length,
    requests: 0,
    responses: 0,
    notifications: 0,
    errors: 0,
  };
  for (const entry of entries) {
    switch (entry.type) {
      case "request":
        summary.requests += 1;
        break;
      case "response":
        summary.responses += 1;
        break;
      case "notification":
        summary.notifications += 1;
        break;
    }
    if (entry.error) summary.errors += 1;
  }
  return summary;
}
