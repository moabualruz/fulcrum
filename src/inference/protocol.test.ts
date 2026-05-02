import { describe, expect, test } from "bun:test";

import {
  HealthResultSchema,
  InferenceErrorSchema,
  InferenceRequestSchema,
  InferenceResponseSchema,
  decodeJsonRpcFrame,
  encodeJsonRpcFrame,
} from "./protocol.ts";

describe("inference protocol", () => {
  test("schemas validate JSON-RPC health request and response shapes", () => {
    const request = InferenceRequestSchema.parse({
      jsonrpc: "2.0",
      id: 1,
      method: "health",
      params: {},
    });

    const response = InferenceResponseSchema.parse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        status: "ok",
        backends: ["embedded"],
        models: ["bge-small-en-v1.5"],
      },
    });

    expect(request.method).toBe("health");
    expect(HealthResultSchema.parse(response.result).status).toBe("ok");
  });

  test("schemas validate typed inference errors", () => {
    const error = InferenceErrorSchema.parse({
      code: -32601,
      backend: "embedded",
      message: "Method not found",
    });

    expect(error.code).toBe(-32601);
    expect(error.backend).toBe("embedded");
  });

  test("length-prefixed JSON-RPC frames round-trip", () => {
    const request = {
      jsonrpc: "2.0" as const,
      id: "abc",
      method: "health",
      params: {},
    };

    const frame = encodeJsonRpcFrame(request);
    const expectedLength = new TextEncoder().encode(JSON.stringify(request)).byteLength;

    expect(frame.byteLength).toBe(expectedLength + 4);
    expect(new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0)).toBe(expectedLength);
    expect(decodeJsonRpcFrame(frame)).toEqual(request);
  });
});
