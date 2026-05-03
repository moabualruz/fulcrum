/**
 * Gated embedding write pipeline.
 *
 * When FULCRUM_FEATURES=embeddings:
 *   - Memory writes enqueue `generate-memory-embedding` job
 *   - Doc saves enqueue `generate-doc-embedding` job
 *   - Job handler calls sidecar embed(body) → float32[384]
 *   - Result written to memory_embeddings / doc_embeddings
 *
 * Default OFF — no sidecar calls, no embedding rows.
 */

import type { ProductDb } from "./db/types.ts";
import { embeddingsEnabled } from "./feature-flags.ts";
import { enqueueJob } from "./jobs.ts";
import { newUlid } from "./ids.ts";

const EXPECTED_DIMENSION = 384;
const EMBEDDING_QUEUE = "embeddings";
const MAX_RETRY_ATTEMPTS = 3; // 1 initial + 2 retries

// --- Enqueueing ---

export async function enqueueMemoryEmbedding(
  db: ProductDb,
  opts: { orgId: string; memoryId: string; body: string },
): Promise<boolean> {
  if (!embeddingsEnabled()) return false;
  await enqueueJob(db, {
    orgId: opts.orgId,
    queue: EMBEDDING_QUEUE,
    kind: "generate-memory-embedding",
    payload: { memoryId: opts.memoryId, body: opts.body },
    maxAttempts: MAX_RETRY_ATTEMPTS,
  });
  return true;
}

export async function enqueueDocEmbedding(
  db: ProductDb,
  opts: { orgId: string; docId: string; body: string },
): Promise<boolean> {
  if (!embeddingsEnabled()) return false;
  await enqueueJob(db, {
    orgId: opts.orgId,
    queue: EMBEDDING_QUEUE,
    kind: "generate-doc-embedding",
    payload: { docId: opts.docId, body: opts.body },
    maxAttempts: MAX_RETRY_ATTEMPTS,
  });
  return true;
}

// --- Sidecar client ---

export interface EmbedResult {
  embedding: number[];
  modelId: string;
}

export interface EmbedSidecar {
  embed(text: string): Promise<EmbedResult>;
}

/**
 * Default HTTP sidecar client.
 * Expects POST to FULCRUM_EMBED_URL with { text } body,
 * returns { embedding: number[], model_id: string }.
 */
export function httpSidecar(url?: string): EmbedSidecar {
  const baseUrl = url ?? process.env["FULCRUM_EMBED_URL"] ?? "http://localhost:11434/embed";
  return {
    async embed(text: string): Promise<EmbedResult> {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Sidecar error: HTTP ${res.status}`);
      const data = (await res.json()) as { embedding: number[]; model_id: string };
      return { embedding: data.embedding, modelId: data.model_id };
    },
  };
}

// --- Job handlers ---

export async function handleMemoryEmbeddingJob(
  db: ProductDb,
  payload: { memoryId: string; body: string },
  sidecar: EmbedSidecar,
): Promise<void> {
  const result = await sidecar.embed(payload.body);
  if (result.embedding.length !== EXPECTED_DIMENSION) {
    throw new Error(
      `Dimension mismatch: expected ${EXPECTED_DIMENSION}, got ${result.embedding.length}`,
    );
  }
  const id = newUlid();
  const arrayLiteral = `{${result.embedding.join(",")}}`;
  await db.query(
    `INSERT INTO memory_embeddings (id, memory_id, embedding, model_id)
     VALUES ($1, $2, $3::real[], $4)
     ON CONFLICT (memory_id) DO UPDATE
       SET embedding = EXCLUDED.embedding,
           model_id = EXCLUDED.model_id,
           created_at = now()`,
    [id, payload.memoryId, arrayLiteral, result.modelId],
  );
}

export async function handleDocEmbeddingJob(
  db: ProductDb,
  payload: { docId: string; body: string },
  sidecar: EmbedSidecar,
): Promise<void> {
  const result = await sidecar.embed(payload.body);
  if (result.embedding.length !== EXPECTED_DIMENSION) {
    throw new Error(
      `Dimension mismatch: expected ${EXPECTED_DIMENSION}, got ${result.embedding.length}`,
    );
  }
  const id = newUlid();
  const arrayLiteral = `{${result.embedding.join(",")}}`;
  await db.query(
    `INSERT INTO doc_embeddings (id, doc_id, embedding, model_id)
     VALUES ($1, $2, $3::real[], $4)
     ON CONFLICT (doc_id) DO UPDATE
       SET embedding = EXCLUDED.embedding,
           model_id = EXCLUDED.model_id,
           created_at = now()`,
    [id, payload.docId, arrayLiteral, result.modelId],
  );
}

// --- Repository helpers ---

export async function countMemoryEmbeddings(db: ProductDb): Promise<number> {
  const rows = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM memory_embeddings`,
  );
  return rows[0]?.count ?? 0;
}

export async function countDocEmbeddings(db: ProductDb): Promise<number> {
  const rows = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM doc_embeddings`,
  );
  return rows[0]?.count ?? 0;
}

export async function getMemoryEmbedding(
  db: ProductDb,
  memoryId: string,
): Promise<{ id: string; memory_id: string; model_id: string; created_at: string } | null> {
  const rows = await db.query<{ id: string; memory_id: string; model_id: string; created_at: string }>(
    `SELECT id, memory_id, model_id, created_at FROM memory_embeddings WHERE memory_id = $1`,
    [memoryId],
  );
  return rows[0] ?? null;
}

export async function getDocEmbedding(
  db: ProductDb,
  docId: string,
): Promise<{ id: string; doc_id: string; model_id: string; created_at: string } | null> {
  const rows = await db.query<{ id: string; doc_id: string; model_id: string; created_at: string }>(
    `SELECT id, doc_id, model_id, created_at FROM doc_embeddings WHERE doc_id = $1`,
    [docId],
  );
  return rows[0] ?? null;
}

// --- Doctor subsystem ---

export interface EmbeddingsDoctorReport {
  flag: "on" | "off";
  status: "disabled" | "ok" | "degraded";
  memoryEmbeddingCount: number;
  docEmbeddingCount: number;
  hnswMetadata: boolean;
}

export async function checkEmbeddingsSubsystem(
  db: ProductDb,
): Promise<EmbeddingsDoctorReport> {
  const flag = embeddingsEnabled() ? "on" : "off";

  // Check HNSW metadata via table comments
  const commentRows = await db.query<{ obj_description: string | null }>(
    `SELECT obj_description('memory_embeddings'::regclass) AS obj_description`,
  );
  const hnswMetadata = (commentRows[0]?.obj_description ?? "").includes("HNSW");

  if (!embeddingsEnabled()) {
    return {
      flag: "off",
      status: "disabled",
      memoryEmbeddingCount: 0,
      docEmbeddingCount: 0,
      hnswMetadata,
    };
  }

  const memCount = await countMemoryEmbeddings(db);
  const docCount = await countDocEmbeddings(db);

  return {
    flag,
    status: memCount > 0 || docCount > 0 ? "ok" : "degraded",
    memoryEmbeddingCount: memCount,
    docEmbeddingCount: docCount,
    hnswMetadata,
  };
}
