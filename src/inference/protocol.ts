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
