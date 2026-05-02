import { inject, injectable as Injectable } from "@needle-di/core";
import net from "node:net";
import { z } from "zod";

import { InferenceLifecycle, type InferenceRunning } from "./lifecycle.ts";
import {
  HealthResultSchema,
  InferenceError,
  InferenceResponseSchema,
  EmbedResultSchema,
  GenerateResultSchema,
  ClassifyResultSchema,
  TokenizeResultSchema,
  InferenceModelSchema,
  ModelPullProgressSchema,
  BackendSchema,
  encodeJsonRpcFrame,
  normalizeRpcError,
  type ClassifyResult,
  type EmbedResult,
  type GenerateOptions,
  type GenerateResult,
  type HealthResult,
  type InferenceBackendInfo,
  type InferenceModel,
  type InferenceRequest,
  type InferenceResponse,
  type ModelPullProgress,
  type TokenizeResult,
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
const zOk = z.object({ ok: z.boolean() });

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

  async health(): Promise<HealthResult> {
    return this.call("health", {});
  }

  async embed(texts: string[], options: { model?: string } = {}): Promise<EmbedResult> {
    return EmbedResultSchema.parse(await this.call("embed", { texts, ...options }));
  }

  async generate(prompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
    return GenerateResultSchema.parse(await this.call("generate", { prompt, options }));
  }

  async classify(text: string, labels: string[]): Promise<ClassifyResult> {
    return ClassifyResultSchema.parse(await this.call("classify", { text, labels }));
  }

  async tokenize(text: string, model?: string): Promise<TokenizeResult> {
    return TokenizeResultSchema.parse(await this.call("tokenize", { text, model }));
  }

  async listModels(): Promise<InferenceModel[]> {
    return InferenceModelSchema.array().parse(await this.call("models.list", {}));
  }

  async *pullModel(modelId: string): AsyncIterable<ModelPullProgress> {
    const result = await this.call("models.pull", { modelId });
    const events = Array.isArray(result) ? result : [result];
    for (const event of events) {
      yield ModelPullProgressSchema.parse(event);
    }
  }

  async rmModel(modelId: string): Promise<{ ok: boolean }> {
    return zOk.parse(await this.call("models.rm", { modelId }));
  }

  async listBackends(): Promise<InferenceBackendInfo[]> {
    return BackendSchema.array().parse(await this.call("backends.list", {}));
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
