/**
 * Gated embeddings — task embedding on create/update + hybrid search.
 *
 * When `FULCRUM_FEATURES=embeddings` is ON, task create/update enqueues an
 * `embed-task` job. The job handler calls the inference sidecar, writes the
 * embedding to `tasks.embedding`.
 *
 * Search uses hybrid scoring: 0.6 * normalized_BM25 + 0.4 * cosine when
 * embeddings are available; falls back to ILIKE when OFF.
 */

import { assertEmbeddingDimension } from "../inference/model-metadata.ts";
import type { ProductDb } from "./db/types.ts";
import type { InferenceSidecar } from "./inference.ts";
import { enqueueJob } from "./jobs.ts";

// ── Embed job enqueue ──────────────────────────────────────────────

export async function enqueueEmbedTask(
  db: ProductDb,
  opts: { orgId: string; projectId: string | null; taskId: string },
): Promise<void> {
  await enqueueJob(db, {
    orgId: opts.orgId,
    projectId: opts.projectId,
    queue: "inference",
    kind: "embed-task",
    payload: { taskId: opts.taskId },
  });
}

// ── Embed job handler ──────────────────────────────────────────────

export async function handleEmbedTaskJob(
  db: ProductDb,
  sidecar: InferenceSidecar,
  taskId: string,
): Promise<void> {
  const rows = await db.query<{ title: string; description: string | null }>(
    `SELECT title, description FROM tasks WHERE id = $1`,
    [taskId],
  );
  const task = rows[0];
  if (!task) return; // task deleted between enqueue and run
  const text = [task.title, task.description].filter(Boolean).join(" ");
  const embedding = await sidecar.embed(text);
  assertEmbeddingDimension(embedding);
  await db.query(`UPDATE tasks SET embedding = $1::jsonb WHERE id = $2`, [
    JSON.stringify(embedding),
    taskId,
  ]);
}

// ── Hybrid search ──────────────────────────────────────────────────

export interface TaskSearchHit {
  id: string;
  title: string;
  description: string | null;
  status: string;
  score: number;
}

/**
 * Hybrid search: 0.6 * normalized BM25 + 0.4 * cosine similarity.
 * Falls back to ILIKE when embeddings flag is OFF.
 */
export async function searchTasks(
  db: ProductDb,
  opts: {
    projectId: string;
    text: string;
    embeddingsEnabled: boolean;
    sidecar?: InferenceSidecar;
    limit?: number;
  },
): Promise<TaskSearchHit[]> {
  const limit = opts.limit ?? 25;

  if (!opts.embeddingsEnabled || !opts.sidecar) {
    // Fallback: ILIKE text search
    return searchTasksIlike(db, opts.projectId, opts.text, limit);
  }

  // Get query embedding
  const queryEmbed = await opts.sidecar.embed(opts.text);
  assertEmbeddingDimension(queryEmbed);

  // Get BM25 hits from search_documents for tasks in this project
  const bm25Rows = await db.query<{
    source_id: string;
    bm25_score: number;
  }>(
    `SELECT source_id,
            ts_rank(search_vector, plainto_tsquery('english', $1)) AS bm25_score
       FROM search_documents
      WHERE project_id = $2 AND source_kind = 'task'
        AND search_vector @@ plainto_tsquery('english', $1)
      ORDER BY bm25_score DESC
      LIMIT $3`,
    [opts.text, opts.projectId, limit * 2],
  );

  // Get tasks with embeddings in this project
  const taskRows = await db.query<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    embedding: number[] | null;
  }>(
    `SELECT id, title, description, status, embedding
       FROM tasks
      WHERE project_id = $1
        AND embedding IS NOT NULL
      LIMIT $2`,
    [opts.projectId, limit * 3],
  );

  // Build scoring map
  const maxBm25 = Math.max(...bm25Rows.map((r) => r.bm25_score), 0.001);
  const bm25Map = new Map(
    bm25Rows.map((r) => [r.source_id, r.bm25_score / maxBm25]),
  );

  const scored: TaskSearchHit[] = [];
  for (const task of taskRows) {
    const normBm25 = bm25Map.get(task.id) ?? 0;
    const embedding = typeof task.embedding === "string"
      ? JSON.parse(task.embedding) as number[]
      : task.embedding;
    const cos = embedding ? cosineSimilarity(queryEmbed, embedding) : 0;
    const score = 0.6 * normBm25 + 0.4 * Math.max(0, cos);
    if (score > 0) {
      scored.push({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        score,
      });
    }
  }

  // Also include BM25-only hits that have no embedding
  for (const bm25 of bm25Rows) {
    if (scored.some((s) => s.id === bm25.source_id)) continue;
    const taskRow = await db.query<{
      id: string;
      title: string;
      description: string | null;
      status: string;
    }>(`SELECT id, title, description, status FROM tasks WHERE id = $1`, [
      bm25.source_id,
    ]);
    const t = taskRow[0];
    if (t) {
      scored.push({
        ...t,
        score: 0.6 * (bm25.bm25_score / maxBm25),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

async function searchTasksIlike(
  db: ProductDb,
  projectId: string,
  text: string,
  limit: number,
): Promise<TaskSearchHit[]> {
  const pattern = `%${text}%`;
  const rows = await db.query<{
    id: string;
    title: string;
    description: string | null;
    status: string;
  }>(
    `SELECT id, title, description, status
       FROM tasks
      WHERE project_id = $1
        AND (title ILIKE $2 OR description ILIKE $2)
      ORDER BY updated_at DESC
      LIMIT $3`,
    [projectId, pattern, limit],
  );
  return rows.map((r, i) => ({ ...r, score: 1 - i * 0.01 }));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
