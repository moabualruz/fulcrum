import { TransportListeners, type AcpTransport, type Unsubscribe } from "@agent-client-protocol/application/transports/types.ts";

const ACP_SUBPROTOCOL = "acp.v1";
const DEFAULT_HEARTBEAT_MS = 25_000;
const HEARTBEAT_METHOD = "$/ping";

export interface AcpWebSocketEventTarget<TEvent> {
  addEventListener(type: string, listener: (event: TEvent) => void): void;
}

export interface AcpWebSocketMessageEvent {
  data: unknown;
}

export interface AcpWebSocketCloseEvent {
  code: number;
  reason?: string;
}

export interface AcpWebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: AcpWebSocketMessageEvent) => void): void;
  addEventListener(type: "close", listener: (event: AcpWebSocketCloseEvent) => void): void;
  addEventListener(type: "error", listener: () => void): void;
}

export interface AcpWebSocketConstructor {
  readonly OPEN?: number;
  new (url: string, protocols?: string[]): AcpWebSocketLike;
}

export interface WebSocketTransportOptions {
  url: string;
  headers?: Record<string, string>;
  connectTimeoutMs?: number;
  heartbeatMs?: number;
  WebSocketCtor?: AcpWebSocketConstructor;
}

export class WebSocketTransport implements AcpTransport {
  private readonly messageListeners = new TransportListeners<string>();
  private readonly closeListeners = new TransportListeners<string | undefined>();
  private ws: AcpWebSocketLike | null = null;
  private closed = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly openState: number;

  private constructor(ws: AcpWebSocketLike, heartbeatMs: number, openState: number) {
    this.ws = ws;
    this.openState = openState;
    ws.addEventListener("message", (event) => this.handleMessage(event));
    ws.addEventListener("close", (event) => {
      this.handleClose(`websocket closed (code=${event.code}, reason=${event.reason || "unknown"})`);
    });
    ws.addEventListener("error", () => {
      // The close event forwards the terminal state.
    });
    if (heartbeatMs > 0) this.startHeartbeat(heartbeatMs);
  }

  static async connect(opts: WebSocketTransportOptions): Promise<WebSocketTransport> {
    const Ctor = opts.WebSocketCtor ?? getGlobalWebSocketCtor();
    if (typeof Ctor !== "function") throw new Error("WebSocket is not available in this environment");
    if (!opts.url) throw new Error("WebSocketTransport requires a url");

    const ws = new Ctor(opts.url, buildSubprotocols(opts.headers));
    const timeoutMs = opts.connectTimeoutMs ?? 15_000;
    const openState = Ctor.OPEN ?? 1;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      const timer = setTimeout(() => {
        settle(() => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          reject(new Error(`WebSocket connect timed out after ${timeoutMs}ms`));
        });
      }, timeoutMs);

      ws.addEventListener("open", () => {
        clearTimeout(timer);
        settle(() => resolve());
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        settle(() => reject(new Error("WebSocket connect failed")));
      });
      ws.addEventListener("close", (event) => {
        clearTimeout(timer);
        settle(() => reject(new Error(`WebSocket closed before open (code=${event.code}, reason=${event.reason || "unknown"})`)));
      });
    });

    return new WebSocketTransport(ws, opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS, openState);
  }

  async send(json: string): Promise<void> {
    if (this.closed || !this.ws) throw new Error("WebSocketTransport is closed");
    if (this.ws.readyState !== this.openState) throw new Error(`WebSocketTransport not open (readyState=${this.ws.readyState})`);
    this.ws.send(json.endsWith("\n") ? json : `${json}\n`);
  }

  onMessage(cb: (json: string) => void): Unsubscribe {
    return this.messageListeners.add(cb);
  }

  onClose(cb: (reason?: string) => void): Unsubscribe {
    return this.closeListeners.add(cb);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close(1000, "client closed");
      } catch (error) {
        console.warn("Error closing WebSocket:", error);
      }
    }
    queueMicrotask(() => {
      if (!this.closed) this.handleClose("closed by client");
    });
  }

  private handleMessage(event: AcpWebSocketMessageEvent): void {
    if (typeof event.data !== "string") {
      console.error("WebSocketTransport received non-string frame; dropping", event.data);
      return;
    }
    if (!event.data.includes("\n")) {
      const trimmed = event.data.trim();
      if (trimmed.length > 0) this.messageListeners.emit(trimmed);
      return;
    }
    for (const line of event.data.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length > 0) this.messageListeners.emit(trimmed);
    }
  }

  private handleClose(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.stopHeartbeat();
    this.closeListeners.emit(reason);
    this.messageListeners.clear();
    this.closeListeners.clear();
    this.ws = null;
  }

  private startHeartbeat(intervalMs: number): void {
    const frame = `{"jsonrpc":"2.0","method":"${HEARTBEAT_METHOD}"}\n`;
    this.heartbeatTimer = setInterval(() => {
      if (this.closed || !this.ws || this.ws.readyState !== this.openState) {
        this.stopHeartbeat();
        return;
      }
      try {
        this.ws.send(frame);
      } catch (error) {
        console.warn("WebSocketTransport heartbeat send failed:", error);
        this.stopHeartbeat();
      }
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export function buildSubprotocols(headers?: Record<string, string>): string[] {
  const protocols: string[] = [ACP_SUBPROTOCOL];
  if (!headers) return protocols;
  const auth = pickHeader(headers, "authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match?.[1]) protocols.push(`bearer.${match[1].replace(/\s+/g, "")}`);
  }
  return protocols;
}

function pickHeader(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

function getGlobalWebSocketCtor(): AcpWebSocketConstructor | undefined {
  const candidate = (globalThis as { WebSocket?: AcpWebSocketConstructor }).WebSocket;
  return candidate;
}
