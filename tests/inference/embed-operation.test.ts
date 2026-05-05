import { describe, expect, test } from "bun:test";

import { InferenceClient } from "../../src/inference/client.ts";
import type { InferenceRequest, InferenceResponse } from "../../src/inference/protocol.ts";

function clientWithTransport(
  onRequest: (request: InferenceRequest) => InferenceResponse | Promise<InferenceResponse>,
): InferenceClient {
  return new InferenceClient({
    transport: async (request) => onRequest(request),
    timeoutMs: 500,
    retryDelaysMs: [1],
  });
}

describe("embed operation", () => {
  test("TS client sends embed params to the sidecar surface and parses response metadata", async () => {
    let observedRequest: InferenceRequest | undefined;
    const client = clientWithTransport((request) => {
      observedRequest = request;
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          vectors: [
            [0.1, 0.2],
            [0.3, 0.4],
          ],
          model: "BAAI/bge-small-en-v1.5",
          cached: false,
        },
      };
    });

    const result = await client.embed(["alpha", "beta"]);

    expect(observedRequest?.method).toBe("embed");
    expect(observedRequest?.params).toEqual({ texts: ["alpha", "beta"] });
    expect(result).toEqual({
      vectors: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      model: "BAAI/bge-small-en-v1.5",
      cached: false,
      dimensions: 2,
    });
  });

  test("TS client forwards selected model to the sidecar embed method", async () => {
    let observedParams: unknown;
    const client = clientWithTransport((request) => {
      observedParams = request.params;
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          vectors: [[0.5, 0.6]],
          model: "custom-embed-model",
          cached: true,
        },
      };
    });

    const result = await client.embed(["gamma"], { model: "custom-embed-model" });

    expect(observedParams).toEqual({ texts: ["gamma"], model: "custom-embed-model" });
    expect(result.model).toBe("custom-embed-model");
    expect(result.cached).toBe(true);
  });
});
