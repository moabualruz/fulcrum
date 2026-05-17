import type { SqlExecutor } from "@platform-core/infrastructure/application-database/sql.ts";

export const EMBEDDINGS_FEATURE = "embeddings";

export type EmbedText = (text: string) => Promise<readonly number[]>;

export function isEmbeddingsEnabled(): boolean {
  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((feature) => feature.trim())
    .includes(EMBEDDINGS_FEATURE);
}

export function embeddingText(title: string, body: string): string {
  return [title.trim(), body.trim()].filter(Boolean).join("\n\n");
}

export function serializeEmbedding(vector: readonly number[]): string {
  return JSON.stringify([...vector]);
}

export function parseEmbedding(value: unknown): number[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== "string" || value.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.map(Number);
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < length; i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return Math.max(0, dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)));
}

export async function ensureEmbeddingIndex(db: SqlExecutor): Promise<void> {
  if (!isEmbeddingsEnabled() || db.engine !== "postgres") return;
  await db.exec(
    `CREATE INDEX IF NOT EXISTS sd_embedding_ivf
       ON search_documents USING ivfflat(embedding vector_cosine_ops) WITH (lists=100)`,
  );
}
