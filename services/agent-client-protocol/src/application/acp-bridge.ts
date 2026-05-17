import { createInMemoryTrafficRecorder, type AcpTrafficRecorder } from "@agent-client-protocol/application/traffic.ts";
import type {
  AuthenticateRequest,
  AuthenticateResponse,
  CancelNotification,
  InitializeRequest,
  InitializeResponse,
  JsonRpcErrorResponse,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSuccessResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  NewSessionRequest,
  NewSessionResponse,
  PermissionRequest,
  PromptRequest,
  PromptResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from "@agent-client-protocol/domain/protocol.ts";
import type { AcpTransport, Unsubscribe } from "@agent-client-protocol/application/transports/types.ts";

type PermissionResolver = (response: RequestPermissionResponse) => void;

export interface AcpHostFileSystem {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
}

export interface AcpClientBridgeOptions {
  fsAvailable?: boolean;
  fileSystem?: AcpHostFileSystem;
  trafficRecorder?: AcpTrafficRecorder;
  requestTimeoutMs?: number;
}

interface PendingRequest<T = unknown> {
  method: string;
  resolve: (response: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const JSONRPC_METHOD_NOT_FOUND = -32601;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export class AcpClientBridge {
  private readonly transport: AcpTransport;
  private readonly fsAvailable: boolean;
  private readonly fileSystem?: AcpHostFileSystem;
  private readonly trafficRecorder: AcpTrafficRecorder;
  private readonly requestTimeoutMs: number;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private nextRequestId = 0;
  private unlistenMessage: Unsubscribe | null = null;
  private unlistenClose: Unsubscribe | null = null;
  private permissionResolver: PermissionResolver | null = null;
  private transportClosed = false;

  public pendingPermissionRequest: PermissionRequest | null = null;
  public onSessionUpdate: ((notification: SessionNotification) => void) | null = null;
  public onTransportClose: ((reason?: string) => void) | null = null;
  public onPermissionRequest: ((request: PermissionRequest) => void) | null = null;
  public onPermissionSettled: (() => void) | null = null;

  constructor(transport: AcpTransport, options: AcpClientBridgeOptions = {}) {
    this.transport = transport;
    this.fsAvailable = options.fsAvailable ?? Boolean(options.fileSystem);
    this.fileSystem = options.fileSystem;
    this.trafficRecorder = options.trafficRecorder ?? createInMemoryTrafficRecorder();
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.unlistenMessage = this.transport.onMessage((message) => this.handleMessage(message));
    this.unlistenClose = this.transport.onClose((reason) => this.handleTransportClose(reason));
  }

  async connect(): Promise<void> {
    // Transport connection is established by its factory before bridge construction.
  }

  async disconnect(): Promise<void> {
    this.transportClosed = true;
    this.resolvePendingPermission({ outcome: { outcome: "cancelled" } });
    if (this.unlistenMessage) {
      this.unlistenMessage();
      this.unlistenMessage = null;
    }
    if (this.unlistenClose) {
      this.unlistenClose();
      this.unlistenClose = null;
    }
    this.rejectPendingRequests(new Error("transport closed: client disconnected"));
    await this.transport.close();
  }

  async initialize(params: InitializeRequest): Promise<InitializeResponse> {
    return await this.sendRequest<InitializeResponse>("initialize", params);
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    return await this.sendRequest<NewSessionResponse>("session/new", params);
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    return await this.sendRequest<LoadSessionResponse>("session/load", params);
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    return await this.sendRequest<PromptResponse>("session/prompt", params);
  }

  async cancel(params: CancelNotification): Promise<void> {
    await this.sendNotification("session/cancel", params);
  }

  async setMode(params: { sessionId: string; modeId: string }): Promise<void> {
    await this.sendRequest("session/set_mode", params);
  }

  async unstable_setSessionModel(params: { sessionId: string; modelId: string }): Promise<void> {
    await this.sendRequest("session/set_model", params);
  }

  async authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse> {
    return await this.sendRequest<AuthenticateResponse>("authenticate", params);
  }

  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    return await new Promise((resolve) => {
      if (this.permissionResolver) {
        this.resolvePendingPermission({ outcome: { outcome: "cancelled" } });
      }
      const request: PermissionRequest = {
        sessionId: params.sessionId,
        toolCall: {
          toolCallId: params.toolCall.toolCallId,
          title: params.toolCall.title ?? "",
          kind: params.toolCall.kind ?? "other",
          status: params.toolCall.status ?? "pending",
          locations: params.toolCall.locations ?? undefined,
        },
        options: params.options.map((option) => ({
          kind: option.kind,
          name: option.name,
          optionId: option.optionId,
        })),
      };
      this.pendingPermissionRequest = request;
      this.permissionResolver = resolve;
      this.onPermissionRequest?.(request);
    });
  }

  resolvePermission(optionId: string): void {
    this.resolvePendingPermission({ outcome: { outcome: "selected", optionId } });
  }

  cancelPermission(): void {
    this.resolvePendingPermission({ outcome: { outcome: "cancelled" } });
  }

  private resolvePendingPermission(response: RequestPermissionResponse): void {
    if (!this.permissionResolver) return;
    const resolve = this.permissionResolver;
    this.permissionResolver = null;
    this.pendingPermissionRequest = null;
    this.onPermissionSettled?.();
    resolve(response);
  }

  async sessionUpdate(_params: SessionNotification): Promise<void> {
    // Notifications are delivered through handleNotification.
  }

  async writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    if (!this.fileSystem) throw new Error("host filesystem is not configured");
    await this.fileSystem.writeTextFile(params.path, params.content);
    return {};
  }

  async readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    if (!this.fileSystem) throw new Error("host filesystem is not configured");
    let content = await this.fileSystem.readTextFile(params.path);
    if (params.line !== undefined || params.limit !== undefined) {
      const lines = content.split("\n");
      const startLine = params.line ? params.line - 1 : 0;
      const endLine = params.limit ? startLine + params.limit : lines.length;
      content = lines.slice(startLine, endLine).join("\n");
    }
    return { content };
  }

  private handleMessage(message: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch (error) {
      console.error("Failed to parse ACP message:", message, error);
      return;
    }

    if (!isJsonRpcObject(parsed)) return;

    if ("id" in parsed && parsed.id !== undefined && !("method" in parsed)) {
      this.handleResponse(parsed as unknown as JsonRpcResponse);
      return;
    }

    if ("id" in parsed && parsed.id !== undefined && "method" in parsed) {
      const request = parsed as unknown as JsonRpcRequest;
      this.trafficRecorder.addEntry({
        direction: "in",
        type: "request",
        method: request.method,
        requestId: request.id,
        payload: request,
      });
      void this.handleRequest(request.id, request.method, request.params);
      return;
    }

    if (!("id" in parsed) && "method" in parsed) {
      const notification = parsed as unknown as JsonRpcNotification;
      this.trafficRecorder.addEntry({
        direction: "in",
        type: "notification",
        method: notification.method,
        payload: notification,
      });
      this.handleNotification(notification.method, notification.params);
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(Number(response.id));
    const method = pending?.method ?? "unknown";
    this.trafficRecorder.addEntry({
      direction: "in",
      type: "response",
      method,
      requestId: response.id,
      payload: response,
      error: "error" in response,
    });
    if (!pending) return;
    this.pendingRequests.delete(Number(response.id));
    clearTimeout(pending.timer);
    if ("error" in response) {
      pending.reject(new Error(response.error.message || "Unknown error"));
    } else {
      pending.resolve(response.result);
    }
  }

  private async handleRequest(id: number | string, method: string, params: unknown): Promise<void> {
    let result: unknown;
    let error: { code: number; message: string } | undefined;

    try {
      switch (method) {
        case "fs/read_text_file":
          if (!this.fsAvailable) {
            error = { code: JSONRPC_METHOD_NOT_FOUND, message: "fs/read_text_file not available on this client" };
          } else {
            result = await this.readTextFile(params as ReadTextFileRequest);
          }
          break;
        case "fs/write_text_file":
          if (!this.fsAvailable) {
            error = { code: JSONRPC_METHOD_NOT_FOUND, message: "fs/write_text_file not available on this client" };
          } else {
            result = await this.writeTextFile(params as WriteTextFileRequest);
          }
          break;
        case "session/request_permission":
          result = await this.requestPermission(params as RequestPermissionRequest);
          break;
        default:
          error = { code: JSONRPC_METHOD_NOT_FOUND, message: `Method not found: ${method}` };
      }
    } catch (caught) {
      error = { code: -32603, message: caught instanceof Error ? caught.message : String(caught) };
    }

    const response: JsonRpcSuccessResponse | JsonRpcErrorResponse = error
      ? { jsonrpc: "2.0", id, error }
      : { jsonrpc: "2.0", id, result };
    if (this.transportClosed) return;
    this.trafficRecorder.addEntry({
      direction: "out",
      type: "response",
      method,
      requestId: id,
      payload: response,
      error: Boolean(error),
    });
    await this.transport.send(JSON.stringify(response));
  }

  private handleNotification(method: string, params: unknown): void {
    if (method === "session/update" && this.onSessionUpdate) {
      this.onSessionUpdate(params as SessionNotification);
    }
  }

  private async sendRequest<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextRequestId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params: params ?? {},
    };
    this.trafficRecorder.addEntry({
      direction: "out",
      type: "request",
      method,
      requestId: id,
      payload: request,
    });

    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pendingRequests.has(id)) return;
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.requestTimeoutMs);
      this.pendingRequests.set(id, { method, resolve: (response) => resolve(response as T), reject, timer });
      this.transport.send(JSON.stringify(request)).catch((error: unknown) => {
        const pending = this.pendingRequests.get(id);
        if (!pending) return;
        this.pendingRequests.delete(id);
        clearTimeout(pending.timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private async sendNotification(method: string, params?: unknown): Promise<void> {
    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params: params ?? {},
    };
    this.trafficRecorder.addEntry({
      direction: "out",
      type: "notification",
      method,
      payload: notification,
    });
    await this.transport.send(JSON.stringify(notification));
  }

  private handleTransportClose(reason?: string): void {
    this.transportClosed = true;
    this.resolvePendingPermission({ outcome: { outcome: "cancelled" } });
    this.rejectPendingRequests(new Error(`transport closed: ${reason ?? "unknown reason"}`));
    if (this.onTransportClose) this.onTransportClose(reason);
  }

  private rejectPendingRequests(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      this.pendingRequests.delete(id);
      clearTimeout(pending.timer);
      try {
        pending.reject(error);
      } catch {
        /* ignore */
      }
    }
  }
}

function isJsonRpcObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
