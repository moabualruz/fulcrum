/**
 * Sidecar embed() call — wraps Pillar 2 embedding service.
 *
 * embedQuerySafe returns null when sidecar is unavailable (flag on but
 * service down) or returns wrong-dimension vectors.
 * Caller falls back to FTS-only scoring; warning logged.
 */

import { assertEmbeddingDimension } from "../../inference/model-metadata.ts";

const SIDECAR_URL = process.env["FULCRUM_SIDECAR_URL"] ?? "http://127.0.0.1:8384";
const EMBED_TIMEOUT_MS = 5_000;

export interface EmbedResponse {
  embedding: number[];
  model: string;
}

/**
 * Call sidecar embed endpoint. Returns float32[384] vector or null on failure.
 * Never throws — all errors caught and logged as warnings.
 */
export async function embedQuerySafe(query: string): Promise<number[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

    const response = await fetch(new URL("/embed", SIDECAR_URL).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: query }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[retriever] sidecar embed returned ${response.status}; falling back to FTS-only`);
      return null;
    }

    const data = (await response.json()) as EmbedResponse;

    if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
      console.warn("[retriever] sidecar returned invalid embedding; falling back to FTS-only");
      return null;
    }

    // Validate dimension — fail closed on mismatch per D-07
    try {
      assertEmbeddingDimension(data.embedding);
    } catch {
      console.warn(`[retriever] sidecar returned ${data.embedding.length}-dim embedding (expected 384); falling back to FTS-only`);
      return null;
    }

    return data.embedding;
  } catch (error) {
    console.warn("[retriever] sidecar unavailable; falling back to FTS-only:", (error as Error).message);
    return null;
  }
}
