import { inject, injectable as Injectable } from "@needle-di/core";
import net from "node:net";

import { InferenceLifecycle, type InferenceRunning } from "./lifecycle.ts";
import {
  HealthResultSchema,
  InferenceError,
  InferenceResponseSchema,
  encodeJsonRpcFrame,
  normalizeRpcError,
  type HealthResult,
  type InferenceRequest,
  type InferenceResponse,
} from "./protocol.ts";

export interface InferenceLifecycleLike {
  ensureRunning(): Promise<InferenceRunning>;
}

export interface InferenceClientOptions {
  lifecycle?: InferenceLifecycleLike;
  timeoutMs?: number;
  retryDelaysMs?: number[];
  onRetry?: (attempt: number, error: unknown) => void | Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_DELAYS_MS = [100, 200, 400];

let nextRequestId = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof InferenceError) return false;
  const code = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  return code === "ECONNREFUSED" ||
    code === "ENOENT" ||
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "ETIMEDOUT" ||
    (error instanceof Error && error.message.includes("timed out"));
}

function injectedLifecycle(): InferenceLifecycleLike | undefined {
  try {
    return inject(InferenceLifecycle);
  } catch {
    return undefined;
  }
}

@Injectable()
export class InferenceClient {
  private readonly lifecycle: InferenceLifecycleLike;
  private readonly timeoutMs: number;
  private readonly retryDelaysMs: number[];
  private readonly onRetry?: (attempt: number, error: unknown) => void | Promise<void>;

  constructor(options: InferenceClientOptions = {}) {
    this.lifecycle = options.lifecycle ?? injectedLifecycle() ?? new InferenceLifecycle();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.onRetry = options.onRetry;
  }

  async call(method: "health", params: Record<string, never>): Promise<HealthResult>;
  async call(method: string, params: unknown): Promise<unknown>;
  async call(method: string, params: unknown): Promise<unknown> {
    const running = await this.lifecycle.ensureRunning();
    const request: InferenceRequest = {
      jsonrpc: "2.0",
      id: nextRequestId++,
      method,
      params,
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt++) {
      try {
        const response = await this.send(running.socketPath, request);
        if (response.error) throw normalizeRpcError(response.error);
        if (method === "health") return HealthResultSchema.parse(response.result);
        return response.result;
      } catch (error) {
        lastError = error;
        if (error instanceof InferenceError) throw error;
        if (attempt >= this.retryDelaysMs.length || !isRetryable(error)) {
          throw new InferenceError({
            code: -32000,
            backend: "embedded",
            message: error instanceof Error ? error.message : "Inference request failed",
          }, { cause: error });
        }
        await this.onRetry?.(attempt + 1, error);
        await sleep(this.retryDelaysMs[attempt] ?? 0);
      }
    }

    throw new InferenceError({
      code: -32000,
      backend: "embedded",
      message: lastError instanceof Error ? lastError.message : "Inference request failed",
    }, { cause: lastError });
  }

  private send(socketPath: string, request: InferenceRequest): Promise<InferenceResponse> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let buffer = Buffer.alloc(0);
      const socket = net.createConnection({ path: socketPath });

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        callback();
      };

      const timer = setTimeout(() => {
        const error = new Error(`Inference request timed out after ${this.timeoutMs}ms`);
        (error as Error & { code?: string }).code = "ETIMEDOUT";
        finish(() => reject(error));
      }, this.timeoutMs);

      socket.once("connect", () => {
        socket.write(Buffer.from(encodeJsonRpcFrame(request)));
      });
      socket.once("error", (error) => finish(() => reject(error)));
      socket.on("data", (chunk) => {
        const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        buffer = Buffer.concat([buffer, bytes]);
        if (buffer.byteLength < 4) return;
        const length = buffer.readUInt32BE(0);
        if (buffer.byteLength < length + 4) return;
        try {
          const body = buffer.subarray(4, 4 + length).toString("utf8");
          const response = InferenceResponseSchema.parse(JSON.parse(body));
          finish(() => resolve(response));
        } catch (error) {
          finish(() => reject(error));
        }
      });
    });
  }
}
