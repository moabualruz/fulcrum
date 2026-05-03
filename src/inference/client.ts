/**
 * Inference sidecar client. Communicates with a local inference sidecar
 * via JSON-RPC over Unix socket. Provides text embedding capability.
 *
 * When the sidecar is unavailable, callers handle errors gracefully
 * (log warning, leave embedding NULL).
 */

export interface EmbeddingResponse {
  vector: number[];
}

export interface InferenceClient {
  embed(text: string): Promise<EmbeddingResponse>;
}

/**
 * Create an inference client that connects to a Unix socket sidecar.
 * In production, this speaks JSON-RPC to the sidecar process.
 */
export function createInferenceClient(socketPath: string): InferenceClient {
  return {
    async embed(text: string): Promise<EmbeddingResponse> {
      const body = JSON.stringify({ jsonrpc: "2.0", method: "embed", params: { text }, id: 1 });
      const resp = await fetch(new URL("http://localhost/rpc").toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        // @ts-expect-error — Bun fetch supports unix sockets
        unix: socketPath,
      });
      if (!resp.ok) throw new Error(`Inference sidecar error: ${resp.status}`);
      const json = (await resp.json()) as { result?: EmbeddingResponse; error?: { message: string } };
      if (json.error) throw new Error(`Inference sidecar RPC error: ${json.error.message}`);
      if (!json.result) throw new Error("Inference sidecar returned no result");
      return json.result;
    },
  };
}
