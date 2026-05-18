import type { AcpConfigState } from "@agent-client-protocol/application/config-store.ts";
import { applySessionNotification, type AcpSessionState } from "@agent-client-protocol/application/session-store.ts";
import { buildSessionWorkbenchModel, type SessionWorkbenchModel } from "@agent-client-protocol/application/session-workbench.ts";
import type {
  AgentConfig,
  AuthenticateRequest,
  AuthenticateResponse,
  CancelNotification,
  InitializeRequest,
  InitializeResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  NewSessionRequest,
  NewSessionResponse,
  PermissionRequest,
  PromptRequest,
  PromptResponse,
  SavedSession,
  SessionNotification,
} from "@agent-client-protocol/domain/protocol.ts";

export interface AcpBridgeClient {
  pendingPermissionRequest: PermissionRequest | null;
  onSessionUpdate: ((notification: SessionNotification) => void) | null;
  onTransportClose: ((reason?: string) => void) | null;
  onPermissionRequest: ((request: PermissionRequest) => void) | null;
  onPermissionSettled: (() => void) | null;
  initialize(params: InitializeRequest): Promise<InitializeResponse>;
  newSession(params: NewSessionRequest): Promise<NewSessionResponse>;
  loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse>;
  prompt(params: PromptRequest): Promise<PromptResponse>;
  cancel(params: CancelNotification): Promise<void>;
  setMode(params: { sessionId: string; modeId: string }): Promise<void>;
  unstable_setSessionModel(params: { sessionId: string; modelId: string }): Promise<void>;
  authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse>;
  disconnect(): Promise<void>;
  resolvePermission(optionId: string): void;
  cancelPermission(): void;
}

export interface CreateAcpBridgeInput {
  name: string;
  config: AgentConfig;
}

export type CreateAcpBridge = (input: CreateAcpBridgeInput) => Promise<AcpBridgeClient>;

export interface AcpSessionManagerOptions {
  state: AcpSessionState;
  config: AcpConfigState;
  createBridge: CreateAcpBridge;
  appVersion?: string;
  canAccessFs?: boolean;
}

const PROTOCOL_VERSION = 1;

export class AcpSessionManager {
  private readonly state: AcpSessionState;
  private readonly config: AcpConfigState;
  private readonly createBridge: CreateAcpBridge;
  private readonly appVersion: string;
  private readonly canAccessFs: boolean;
  private acpClient: AcpBridgeClient | null = null;

  constructor(options: AcpSessionManagerOptions) {
    this.state = options.state;
    this.config = options.config;
    this.createBridge = options.createBridge;
    this.appVersion = options.appVersion ?? "0.1.0";
    this.canAccessFs = options.canAccessFs ?? false;
  }

  async createSession(agentName: string, cwd: string): Promise<SavedSession> {
    this.state.isLoading = true;
    this.state.isConnecting = true;
    this.state.error = null;

    let bridge: AcpBridgeClient | null = null;
    try {
      const agentConfig = this.config.getAgent(agentName);
      if (!agentConfig) throw new Error(`Agent '${agentName}' not found in config`);

      bridge = await this.createBridge({ name: agentName, config: agentConfig });
      this.installBridgeHandlers(bridge);
      this.acpClient = bridge;

      const initResponse = await bridge.initialize(this.initializeRequest());

      const sessionResponse = await bridge.newSession({
        cwd,
        mcpServers: [],
      });

      const session: SavedSession = {
        id: this.state.createId(),
        agentName,
        sessionId: sessionResponse.sessionId,
        title: `Session ${new Date(this.state.now()).toLocaleString()}`,
        lastUpdated: this.state.now(),
        cwd,
        supportsLoadSession: readLoadSessionCapability(initResponse),
      };

      this.state.currentSession = session;
      this.state.savedSessions.push(session);
      this.state.isConnected = true;
      this.state.messages = [];
      this.state.toolCalls.clear();
      applyModes(this.state, sessionResponse);
      applyModels(this.state, sessionResponse);
      return session;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
      if (bridge) {
        try {
          await bridge.disconnect();
        } catch {
          /* ignore cleanup failure */
        }
      }
      this.acpClient = null;
      throw error;
    } finally {
      this.state.isLoading = false;
      this.state.isConnecting = false;
    }
  }

  getWorkbenchModel(): SessionWorkbenchModel {
    return buildSessionWorkbenchModel({ state: this.state });
  }

  async resumeSession(savedSessionId: string): Promise<SavedSession> {
    this.state.isLoading = true;
    this.state.isConnecting = true;
    this.state.error = null;

    let bridge: AcpBridgeClient | null = null;
    try {
      const savedSession = this.state.savedSessions.find((session) => session.id === savedSessionId);
      if (!savedSession) throw new Error(`Saved session '${savedSessionId}' not found`);
      if (savedSession.supportsLoadSession !== true) throw new Error(`Saved session '${savedSessionId}' cannot be resumed`);

      const agentConfig = this.config.getAgent(savedSession.agentName);
      if (!agentConfig) throw new Error(`Agent '${savedSession.agentName}' not found in config`);

      if (this.acpClient) {
        await this.acpClient.disconnect();
        this.acpClient = null;
      }

      bridge = await this.createBridge({ name: savedSession.agentName, config: agentConfig });
      this.installBridgeHandlers(bridge);
      this.acpClient = bridge;

      const initResponse = await bridge.initialize(this.initializeRequest());
      if (!readLoadSessionCapability(initResponse)) {
        throw new Error(`Agent '${savedSession.agentName}' does not support loading sessions`);
      }

      const sessionResponse = await bridge.loadSession({ sessionId: savedSession.sessionId });
      savedSession.sessionId = sessionResponse.sessionId;
      savedSession.lastUpdated = this.state.now();
      savedSession.supportsLoadSession = true;
      this.state.currentSession = savedSession;
      this.state.isConnected = true;
      this.state.messages = [];
      this.state.toolCalls.clear();
      applyModes(this.state, sessionResponse);
      applyModels(this.state, sessionResponse);
      return savedSession;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
      if (bridge) {
        try {
          await bridge.disconnect();
        } catch {
          /* ignore cleanup failure */
        }
      }
      this.acpClient = null;
      throw error;
    } finally {
      this.state.isLoading = false;
      this.state.isConnecting = false;
    }
  }

  async reconnectActiveSession(): Promise<SavedSession> {
    const session = this.state.currentSession;
    if (!session) throw new Error("No active session to reconnect");
    if (session.supportsLoadSession !== true) throw new Error(`Session '${session.id}' cannot be reconnected`);

    this.state.isLoading = true;
    this.state.isReconnecting = true;
    this.state.error = null;
    this.state.reconnectAttempts += 1;

    let bridge: AcpBridgeClient | null = null;
    try {
      const agentConfig = this.config.getAgent(session.agentName);
      if (!agentConfig) throw new Error(`Agent '${session.agentName}' not found in config`);

      if (this.acpClient) {
        await this.acpClient.disconnect();
        this.acpClient = null;
      }

      bridge = await this.createBridge({ name: session.agentName, config: agentConfig });
      this.installBridgeHandlers(bridge);
      this.acpClient = bridge;

      const initResponse = await bridge.initialize(this.initializeRequest());
      if (!readLoadSessionCapability(initResponse)) {
        throw new Error(`Agent '${session.agentName}' does not support loading sessions`);
      }

      const sessionResponse = await bridge.loadSession({ sessionId: session.sessionId });
      session.sessionId = sessionResponse.sessionId;
      session.lastUpdated = this.state.now();
      session.supportsLoadSession = true;
      this.state.currentSession = session;
      this.state.isConnected = true;
      this.state.reconnectAttempts = 0;
      applyModes(this.state, sessionResponse);
      applyModels(this.state, sessionResponse);
      return session;
    } catch (error) {
      this.state.error = `Reconnect failed: ${error instanceof Error ? error.message : String(error)}. Check the agent process and try again.`;
      if (bridge) {
        try {
          await bridge.disconnect();
        } catch {
          /* ignore cleanup failure */
        }
      }
      this.acpClient = null;
      throw error;
    } finally {
      this.state.isLoading = false;
      this.state.isReconnecting = false;
    }
  }

  async sendPrompt(text: string): Promise<void> {
    const client = this.requireClient();
    const session = this.requireSession();
    this.state.messages.push({
      id: this.state.createId(),
      role: "user",
      content: text,
      timestamp: this.state.now(),
    });

    this.state.isLoading = true;
    try {
      await client.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: "text", text }],
      });
      if (this.state.messages.filter((message) => message.role === "user").length === 1) {
        session.title = `${text.slice(0, 50)}${text.length > 50 ? "..." : ""}`;
      }
      session.lastUpdated = this.state.now();
    } finally {
      this.state.isLoading = false;
    }
  }

  async cancelOperation(): Promise<void> {
    const client = this.acpClient;
    const session = this.state.currentSession;
    if (!client || !session) return;
    await client.cancel({ sessionId: session.sessionId });
  }

  resolvePermission(optionId: string): void {
    this.acpClient?.resolvePermission(optionId);
  }

  cancelPermission(): void {
    this.acpClient?.cancelPermission();
  }

  async setMode(modeId: string): Promise<void> {
    const client = this.requireClient();
    const session = this.requireSession();
    await client.setMode({ sessionId: session.sessionId, modeId });
    this.state.currentModeId = modeId;
  }

  async setModel(modelId: string): Promise<void> {
    const client = this.requireClient();
    const session = this.requireSession();
    await client.unstable_setSessionModel({ sessionId: session.sessionId, modelId });
    this.state.currentModelId = modelId;
  }

  async disconnect(): Promise<void> {
    if (this.acpClient) {
      await this.acpClient.disconnect();
      this.acpClient = null;
    }
    this.state.disconnectState();
  }

  private installBridgeHandlers(bridge: AcpBridgeClient): void {
    bridge.onSessionUpdate = (notification) => {
      applySessionNotification(this.state, notification);
    };
    bridge.onPermissionRequest = (request) => {
      this.state.pendingPermission = request;
    };
    bridge.onPermissionSettled = () => {
      this.state.pendingPermission = null;
    };
    bridge.onTransportClose = (reason) => {
      this.acpClient = null;
      this.state.isConnected = false;
      this.state.isLoading = false;
      this.state.pendingPermission = null;
      this.state.error = `Connection lost: ${reason ?? "transport closed"}. AI Assist will try to reconnect when the app is active.`;
    };
  }

  private requireClient(): AcpBridgeClient {
    if (!this.acpClient) throw new Error("No active session");
    return this.acpClient;
  }

  private requireSession(): SavedSession {
    if (!this.state.currentSession) throw new Error("No active session");
    return this.state.currentSession;
  }

  private initializeRequest(): InitializeRequest {
    return {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: this.canAccessFs,
          writeTextFile: this.canAccessFs,
        },
      },
      clientInfo: {
        name: "fulcrum",
        title: "Fulcrum",
        version: this.appVersion,
      },
    };
  }
}

function readLoadSessionCapability(response: InitializeResponse): boolean {
  const capabilities = toRecord(response.agentCapabilities);
  return capabilities.loadSession === true;
}

function applyModes(state: AcpSessionState, response: NewSessionResponse): void {
  const modes = toRecord(response.modes);
  state.availableModes = arrayValue(modes.availableModes).flatMap((candidate) => {
    const mode = toRecord(candidate);
    const id = stringValue(mode.id);
    const name = stringValue(mode.name);
    if (!id || !name) return [];
    return [{ id, name, description: optionalString(mode.description) }];
  });
  state.currentModeId = stringValue(modes.currentModeId);
}

function applyModels(state: AcpSessionState, response: NewSessionResponse): void {
  const models = toRecord(response.models);
  state.availableModels = arrayValue(models.availableModels).flatMap((candidate) => {
    const model = toRecord(candidate);
    const modelId = stringValue(model.modelId);
    const name = stringValue(model.name);
    if (!modelId || !name) return [];
    return [{ modelId, name, description: optionalString(model.description) }];
  });
  state.currentModelId = stringValue(models.currentModelId);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

let activeSessionManager: AcpSessionManager | null = null;

export function setActiveSessionManager(manager: AcpSessionManager | null): void {
  activeSessionManager = manager;
}

export function getActiveSessionManager(): AcpSessionManager | null {
  return activeSessionManager;
}

export async function resolveSessionPermission(
  _em: unknown,
  input: { sessionId: string; optionId: string },
): Promise<void> {
  const manager = activeSessionManager;
  if (!manager) throw new Error("No active ACP session manager");
  manager.resolvePermission(input.optionId);
}

export async function reconnectActiveSession(_em: unknown): Promise<void> {
  const manager = activeSessionManager;
  if (!manager) throw new Error("No active AI Assist session manager");
  await manager.reconnectActiveSession();
}

export async function updateTrafficControl(
  _em: unknown,
  input: { action: string; value?: string },
): Promise<void> {
  void input;
}
