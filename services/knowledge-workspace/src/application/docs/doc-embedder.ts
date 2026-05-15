/**
 * Gated document embedding pipeline.
 *
 * When `FULCRUM_FEATURES` includes `embeddings`:
 *   - After doc update, sends body_md (first 512 tokens) to inference sidecar
 *   - Writes resulting vector(384) to documents.embedding
 *   - Async, non-blocking: update resolves without waiting
 *   - Failed sidecar call: logged as warning, embedding left unchanged
 *
 * When feature flag OFF: no sidecar call, embedding stays NULL.
 */

import type { SqlExecutor } from "@platform-core/infrastructure/application-database/sql.ts";
import type { InferenceClient } from "@platform-core/application/inference/client.ts";

/** Check if "embeddings" feature is enabled via FULCRUM_FEATURES env var. */
export function isEmbeddingsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const features = env.FULCRUM_FEATURES ?? "";
  return features.split(",").map((s) => s.trim()).includes("embeddings");
}

/** Truncate text to approximately N tokens (rough: 1 token ≈ 4 chars). */
export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

export interface EmbedDocumentInput {
  docId: string;
  bodyMd: string;
}

/**
 * Fire-and-forget embedding of a document's body.
 * Returns a promise that resolves when embedding is written, but callers
 * should NOT await this — use it as a background task.
 *
 * On failure: logs warning, does not throw, does not modify embedding.
 */
export async function embedDocument(
  db: SqlExecutor,
  client: InferenceClient,
  input: EmbedDocumentInput,
): Promise<void> {
  const truncated = truncateToTokens(input.bodyMd, 512);
  const { vector } = await client.embed(truncated);
  // Store as real[] — compatible with PGlite and Postgres.
  // Format: {1.0,2.0,...}
  const arrayLiteral = `{${vector.join(",")}}`;
  await db.query(
    `UPDATE documents SET embedding = $1::real[] WHERE id = $2`,
    [arrayLiteral, input.docId],
  );
}

/**
 * Trigger embedding for a document if feature flag is ON.
 * Non-blocking: fires embedDocument in background, catches + logs errors.
 * Returns immediately.
 */
export function triggerEmbedding(
  db: SqlExecutor,
  client: InferenceClient | null,
  input: EmbedDocumentInput,
  logger: { warn: (msg: string, err?: unknown) => void } = console,
): void {
  if (!client) return;
  if (!isEmbeddingsEnabled()) return;

  // Fire-and-forget with 5s timeout
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("embedding timeout (5s)")), 5000),
  );

  Promise.race([embedDocument(db, client, input), timeout]).catch((err) => {
    logger.warn(`doc-embedder: failed to embed doc ${input.docId}`, err);
  });
}
