export type AgentTransportKind = "stdio" | "websocket" | "http";

export interface AgentConfig {
  transport?: AgentTransportKind;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface AgentsConfig {
  agents: Record<string, AgentConfig>;
}

export function getTransportKind(config: AgentConfig): AgentTransportKind {
  return config.transport ?? "stdio";
}

export function isStdioConfig(config: AgentConfig): config is AgentConfig & { command: string } {
  return getTransportKind(config) === "stdio";
}

export function isRemoteConfig(config: AgentConfig): config is AgentConfig & { url: string } {
  const kind = getTransportKind(config);
  return (kind === "websocket" || kind === "http") && typeof config.url === "string" && config.url.length > 0;
}

export interface AgentInstance {
  id: string;
  name: string;
}

export interface AgentMessage {
  agent_id: string;
  message: string;
}

export interface AgentStderr {
  agent_id: string;
  line: string;
}

export interface SavedSession {
  id: string;
  agentName: string;
  sessionId: string;
  title: string;
  lastUpdated: number;
  cwd: string;
  supportsLoadSession?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
}

export interface ToolCallInfo {
  toolCallId: string;
  title: string;
  kind: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  locations?: { path: string }[];
  diffs?: ToolCallDiff[];
}

export interface ToolCallDiffLine {
  oldLine: number | null;
  newLine: number | null;
  kind: "context" | "add" | "remove";
  content: string;
}

export interface ToolCallDiff {
  id: string;
  filePath: string;
  language: string;
  status: "pending" | "accepted" | "rejected";
  lines: ToolCallDiffLine[];
}

export interface PermissionRequest {
  sessionId: string;
  toolCall: ToolCallInfo;
  options: PermissionOption[];
}

export interface PermissionOption {
  kind: string;
  name: string;
  optionId: string;
}

export interface SessionMode {
  id: string;
  name: string;
  description?: string;
}

export interface SessionModeState {
  currentModeId: string;
  availableModes: SessionMode[];
}

export interface SlashCommand {
  name: string;
  description: string;
  hint?: string;
}

export interface ModelInfo {
  modelId: string;
  name: string;
  description?: string;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result: T;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: number | string;
  error: {
    code: number;
    message: string;
  };
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccessResponse<T> | JsonRpcErrorResponse;

export interface InitializeRequest {
  protocolVersion?: string | number;
  clientCapabilities?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface InitializeResponse {
  protocolVersion?: string;
  agentCapabilities?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NewSessionRequest {
  cwd?: string;
  modelId?: string;
  modeId?: string;
  [key: string]: unknown;
}

export interface NewSessionResponse {
  sessionId: string;
  [key: string]: unknown;
}

export interface LoadSessionRequest {
  sessionId: string;
  [key: string]: unknown;
}

export interface LoadSessionResponse {
  sessionId: string;
  [key: string]: unknown;
}

export interface PromptRequest {
  sessionId: string;
  prompt?: unknown;
  [key: string]: unknown;
}

export interface PromptResponse {
  [key: string]: unknown;
}

export interface CancelNotification {
  sessionId: string;
  [key: string]: unknown;
}

export interface AuthenticateRequest {
  [key: string]: unknown;
}

export interface AuthenticateResponse {
  [key: string]: unknown;
}

export interface RequestPermissionRequest {
  sessionId: string;
  toolCall: Partial<ToolCallInfo> & { toolCallId: string };
  options: PermissionOption[];
}

export interface RequestPermissionResponse {
  outcome: { outcome: "selected"; optionId: string } | { outcome: "cancelled" };
}

export interface SessionNotification {
  sessionId?: string;
  [key: string]: unknown;
}

export interface ReadTextFileRequest {
  path: string;
  line?: number;
  limit?: number;
}

export interface ReadTextFileResponse {
  content: string;
}

export interface WriteTextFileRequest {
  path: string;
  content: string;
}

export type WriteTextFileResponse = Record<string, never>;
