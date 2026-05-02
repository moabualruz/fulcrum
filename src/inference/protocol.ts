import { z } from "zod";

const JsonRpcIdSchema = z.union([z.string(), z.number(), z.null()]);

export const InferenceRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: JsonRpcIdSchema.optional(),
  method: z.string().min(1),
  params: z.unknown().optional().default({}),
});

export const RpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const InferenceResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: JsonRpcIdSchema.optional(),
  result: z.unknown().optional(),
  error: RpcErrorSchema.optional(),
});

export const HealthResultSchema = z.object({
  status: z.string(),
  backends: z.array(z.string()),
  models: z.array(z.string()),
  cache: z.object({
    db_path: z.string(),
    embed_rows: z.number().int().nonnegative(),
    gen_rows: z.number().int().nonnegative(),
  }).optional(),
});

export const EmbedResultSchema = z.object({
  vectors: z.array(z.array(z.number())),
  model: z.string(),
  cached: z.boolean(),
});

export const GenerateOptionsSchema = z.object({
  model: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
}).optional();

export const GenerateResultSchema = z.object({
  text: z.string(),
  model: z.string(),
  tokens: z.number().int().nonnegative(),
});

export const ClassifyScoreSchema = z.object({
  label: z.string(),
  score: z.number(),
});

export const ClassifyResultSchema = z.array(ClassifyScoreSchema);

export const TokenizeResultSchema = z.object({
  count: z.number().int().nonnegative(),
  tokens: z.array(z.string()),
});

export const InferenceModelSchema = z.object({
  id: z.string(),
  kind: z.enum(["embed", "generate", "classify"]),
  downloaded: z.boolean(),
  active: z.boolean(),
  sizeBytes: z.number().int().nonnegative().optional(),
  sizeBytesActual: z.number().int().nonnegative().optional(),
});

export const ModelPullProgressSchema = z.object({
  type: z.literal("download_progress").optional(),
  pct: z.number().min(0).max(100),
  downloaded: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const BackendSchema = z.object({
  id: z.enum(["embedded", "ollama", "lm-studio", "openai-compatible"]),
  available: z.boolean(),
  active: z.boolean(),
  reason: z.string().nullable(),
});

export const InferenceErrorSchema = z.object({
  code: z.number(),
  backend: z.string(),
  message: z.string(),
});

export type InferenceRequest = z.infer<typeof InferenceRequestSchema>;
export type InferenceResponse = z.infer<typeof InferenceResponseSchema>;
export type RpcError = z.infer<typeof RpcErrorSchema>;
export type HealthResult = z.infer<typeof HealthResultSchema>;
export type EmbedResult = z.infer<typeof EmbedResultSchema>;
export type GenerateOptions = z.infer<typeof GenerateOptionsSchema>;
export type GenerateResult = z.infer<typeof GenerateResultSchema>;
export type ClassifyResult = z.infer<typeof ClassifyResultSchema>;
export type TokenizeResult = z.infer<typeof TokenizeResultSchema>;
export type InferenceModel = z.infer<typeof InferenceModelSchema>;
export type ModelPullProgress = z.infer<typeof ModelPullProgressSchema>;
export type InferenceBackendInfo = z.infer<typeof BackendSchema>;
export type InferenceErrorPayload = z.infer<typeof InferenceErrorSchema>;

export class InferenceError extends Error {
  readonly code: number;
  readonly backend: string;

  constructor(payload: InferenceErrorPayload, options?: { cause?: unknown }) {
    super(payload.message, options);
    this.name = "InferenceError";
    this.code = payload.code;
    this.backend = payload.backend;
  }
}

export function encodeJsonRpcFrame(payload: InferenceRequest | InferenceResponse): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const frame = new Uint8Array(body.byteLength + 4);
  new DataView(frame.buffer, frame.byteOffset, frame.byteLength).setUint32(0, body.byteLength);
  frame.set(body, 4);
  return frame;
}

export function decodeJsonRpcFrame(frame: Uint8Array): unknown {
  if (frame.byteLength < 4) {
    throw new InferenceError({
      code: -32700,
      backend: "embedded",
      message: "Incomplete inference frame header",
    });
  }
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const length = view.getUint32(0);
  if (frame.byteLength - 4 < length) {
    throw new InferenceError({
      code: -32700,
      backend: "embedded",
      message: "Incomplete inference frame body",
    });
  }
  const json = new TextDecoder().decode(frame.subarray(4, 4 + length));
  return JSON.parse(json);
}

export function normalizeRpcError(error: RpcError, backend = "embedded"): InferenceError {
  const data = error.data;
  const dataBackend = typeof data === "object" && data !== null && "backend" in data
    ? (data as { backend?: unknown }).backend
    : undefined;
  return new InferenceError({
    code: error.code,
    backend: typeof dataBackend === "string" ? dataBackend : backend,
    message: error.message,
  });
}
