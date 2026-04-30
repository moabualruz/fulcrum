import type { ProductDb } from "./db/types.ts";
import { newUlid } from "./ids.ts";

export interface SearchHit {
  id: string;
  source_kind: string;
  source_id: string;
  title: string;
  body: string;
  score: number;
  updated_at: string;
}

export interface SearchFilters {
  orgId: string;
  projectId?: string | null;
  sourceKinds?: readonly string[];
  limit?: number;
}

export interface IndexInput {
  orgId: string;
  projectId?: string | null;
  sourceKind: string;
  sourceId: string;
  title: string;
  body: string;
  labels?: readonly string[];
}

export async function indexSearchDocument(
  db: ProductDb,
  input: IndexInput,
): Promise<void> {
  const labels = input.labels ?? [];
  const id = newUlid();
  // Postgres array literal: {"a","b"}
  const arrayLiteral = `{${labels.map((l) => `"${l.replace(/"/g, '\\"')}"`).join(",")}}`;
  await db.query(
    `INSERT INTO search_documents (id, org_id, project_id, source_kind, source_id, title, body, labels)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[])
     ON CONFLICT (source_kind, source_id) DO UPDATE
       SET title = EXCLUDED.title,
           body = EXCLUDED.body,
           labels = EXCLUDED.labels,
           updated_at = now()`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.sourceKind,
      input.sourceId,
      input.title,
      input.body,
      arrayLiteral,
    ],
  );
}

export async function searchProductDocuments(
  db: ProductDb,
  query: string,
  filters: SearchFilters,
): Promise<SearchHit[]> {
  const limit = filters.limit ?? 25;
  const params: (string | number | null)[] = [filters.orgId, query, limit];
  let where = "org_id = $1 AND search_vector @@ plainto_tsquery('english', $2)";
  if (filters.projectId !== undefined) {
    params.push(filters.projectId);
    where += ` AND project_id ${filters.projectId === null ? "IS NULL" : `= $${params.length}`}`;
  }
  if (filters.sourceKinds && filters.sourceKinds.length > 0) {
    const placeholders = filters.sourceKinds.map((kind) => {
      params.push(kind);
      return `$${params.length}`;
    });
    where += ` AND source_kind IN (${placeholders.join(",")})`;
  }
  const rows = await db.query<SearchHit>(
    `SELECT id, source_kind, source_id, title, body, updated_at,
            ts_rank(search_vector, plainto_tsquery('english', $2)) AS score
       FROM search_documents
      WHERE ${where}
      ORDER BY score DESC, updated_at DESC, id ASC
      LIMIT $3`,
    params as never,
  );
  return rows;
}
