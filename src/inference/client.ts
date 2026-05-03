import { injectable as Injectable } from "@needle-di/core";
import net from "node:net";

import { InferenceLifecycle, type InferenceRunning } from "./lifecycle.ts";
import {
  BackendSchema,
  ClassifyResultSchema,
  EmbedResultSchema,
  GenerateResultSchema,
  HealthResultSchema,
  InferenceModelSchema,
  InferenceResponseSchema,
  ModelPullProgressSchema,
  TokenizeResultSchema,
  decodeJsonRpcFrame,
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

export interface EmbeddingResponse {
  vector: number[];
  model?: string;
  cached?: boolean;
}

export interface InferenceLifecycleLike {
  ensureRunning(): Promise<InferenceRunning>;
}

export type InferenceTransport = (request: InferenceRequest) => Promise<InferenceResponse>;

export interface InferenceClientOptions {
  lifecycle?: InferenceLifecycleLike;
  socketPath?: string;
  transport?: InferenceTransport;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_DELAYS_MS = [50, 150, 300] as const;
const RETRYABLE_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ENOENT", "EPIPE", "ETIMEDOUT"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function isRetryable(error: unknown): boolean {
  const code = errorCode(error);
  return code !== undefined && RETRYABLE_CODES.has(code);
}

function toInferenceError(error: unknown): Error {
  if (error instanceof Error && error.name === "InferenceError") return error;
  const message = error instanceof Error ? error.message : "Inference request failed";
  const wrapped = new Error(message);
  wrapped.name = "InferenceError";
  (wrapped as Error & { code?: number; backend?: string }).code = -32000;
  (wrapped as Error & { code?: number; backend?: string }).backend = "embedded";
  return wrapped;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`Inference request timed out after ${timeoutMs}ms`);
      (error as Error & { code?: string }).code = "ETIMEDOUT";
      reject(error);
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function socketTransport(socketPath: string, request: InferenceRequest, timeoutMs: number): Promise<InferenceResponse> {
  return withTimeout(new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const socket = net.createConnection({ path: socketPath });

    const fail = (error: unknown) => {
      socket.destroy();
      reject(error);
    };

    socket.once("connect", () => {
      socket.write(Buffer.from(encodeJsonRpcFrame(request)));
    });
    socket.once("error", fail);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
      if (buffer.byteLength < 4) return;
      const length = buffer.readUInt32BE(0);
      if (buffer.byteLength < length + 4) return;
      try {
        const decoded = decodeJsonRpcFrame(buffer.subarray(0, length + 4));
        resolve(InferenceResponseSchema.parse(decoded));
      } catch (error) {
        reject(error);
      } finally {
        socket.end();
      }
    });
  }), timeoutMs);
}

function normalizeEmbedResult(result: unknown): EmbedResult {
  const raw = typeof result === "object" && result !== null ? result as Record<string, unknown> : {};
  const vectors = Array.isArray(raw.vectors)
    ? raw.vectors
    : Array.isArray(raw.vector)
      ? [raw.vector]
      : undefined;
  return EmbedResultSchema.parse({
    vectors,
    model: raw.model ?? "embedded",
    cached: raw.cached ?? false,
  });
}

function vectorFromEmbedResult(result: EmbedResult): EmbeddingResponse {
  return {
    vector: result.vectors[0] ?? [],
    model: result.model,
    cached: result.cached,
  };
}

let nextRequestId = 1;

export class InferenceClient {
  private readonly lifecycle: InferenceLifecycleLike;
  private readonly socketPath?: string;
  private readonly transport?: InferenceTransport;
  private readonly timeoutMs: number;
  private readonly retryDelaysMs: readonly number[];

  constructor(options: InferenceClientOptions = {}) {
    this.lifecycle = options.lifecycle ?? new InferenceLifecycle();
    this.socketPath = options.socketPath;
    this.transport = options.transport;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  }

  async call(method: "health", params: Record<string, never>): Promise<HealthResult>;
  async call(method: string, params?: unknown): Promise<unknown>;
  async call(method: string, params: unknown = {}): Promise<unknown> {
    const request: InferenceRequest = {
      jsonrpc: "2.0",
      id: nextRequestId++,
      method,
      params,
    };

    const response = await this.sendWithRetries(request);
    if (response.error) throw normalizeRpcError(response.error);
    if (!("result" in response)) {
      throw normalizeRpcError({ code: -32603, message: "Inference sidecar returned no result" });
    }
    return response.result;
  }

  health(): Promise<HealthResult> {
    return this.call("health", {}).then((result) => HealthResultSchema.parse(result));
  }

  async embed(text: string): Promise<EmbeddingResponse>;
  async embed(texts: string[], options?: { model?: string }): Promise<EmbedResult>;
  async embed(input: string | string[], options: { model?: string } = {}): Promise<EmbeddingResponse | EmbedResult> {
    const texts = Array.isArray(input) ? input : [input];
    const params = options.model ? { texts, model: options.model } : { texts };
    const result = normalizeEmbedResult(await this.call("embed", params));
    return Array.isArray(input) ? result : vectorFromEmbedResult(result);
  }

  async generate(
    prompt: string,
    options?: GenerateOptions & { backend?: string },
  ): Promise<GenerateResult> {
    return GenerateResultSchema.parse(await this.call("generate", { prompt, options: options ?? {} }));
  }

  async classify(text: string, labels: string[]): Promise<ClassifyResult> {
    return ClassifyResultSchema.parse(await this.call("classify", { text, labels }));
  }

  async tokenize(text: string, model?: string): Promise<TokenizeResult> {
    const params = model ? { text, model } : { text };
    return TokenizeResultSchema.parse(await this.call("tokenize", params));
  }

  async listModels(): Promise<InferenceModel[]> {
    return InferenceModelSchema.array().parse(await this.call("models.list", {}));
  }

  async *pullModel(modelId: string, options: { force?: boolean } = {}): AsyncIterable<ModelPullProgress> {
    const result = await this.call("models.pull", { modelId, force: options.force ?? false });
    const events = Array.isArray(result) ? result : [result];
    for (const event of events) {
      yield ModelPullProgressSchema.parse(event);
    }
  }

  async rmModel(modelId: string): Promise<{ ok: boolean }> {
    const result = await this.call("models.rm", { modelId });
    if (typeof result !== "object" || result === null || typeof (result as { ok?: unknown }).ok !== "boolean") {
      throw normalizeRpcError({ code: -32603, message: "Inference sidecar returned invalid models.rm result" });
    }
    return { ok: (result as { ok: boolean }).ok };
  }

  async listBackends(): Promise<InferenceBackendInfo[]> {
    const result = await this.call("backends.list", {});
    return BackendSchema.array().parse(result);
  }

  private async sendWithRetries(request: InferenceRequest): Promise<InferenceResponse> {
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt += 1) {
      try {
        return await this.send(request);
      } catch (error) {
        if (attempt >= this.retryDelaysMs.length || !isRetryable(error)) {
          throw toInferenceError(error);
        }
        await sleep(this.retryDelaysMs[attempt] ?? 0);
      }
    }
    throw toInferenceError(new Error("Inference request failed"));
  }

  private async send(request: InferenceRequest): Promise<InferenceResponse> {
    if (this.transport) return this.transport(request);
    const socketPath = this.socketPath ?? (await this.lifecycle.ensureRunning()).socketPath;
    return socketTransport(socketPath, request, this.timeoutMs);
  }
}

Injectable()(InferenceClient);

/**
 * Backward-compatible factory for older embedding-only call sites.
 */
export function createInferenceClient(socketPath: string): InferenceClient {
  return new InferenceClient({ socketPath });
}
