import type { SqlExecutor, SqlValue } from "../db/sql.ts";
import type { SearchIndexKind } from "./indexers/base.ts";

export interface SearchSuggestInput {
  orgId: string;
  prefix: string;
  kind?: SearchIndexKind | string;
}

export interface SearchSuggestOutput {
  suggestions: string[];
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function suggestSearchDocuments(
  db: SqlExecutor,
  input: SearchSuggestInput,
): Promise<SearchSuggestOutput> {
  const prefix = input.prefix.trim();
  if (prefix === "") return { suggestions: [] };

  const params: SqlValue[] = [input.orgId, `${escapeLike(prefix)}%`];
  const clauses = ["org_id = $1", "title ILIKE $2 ESCAPE '\\'"];

  if (input.kind) {
    params.push(input.kind);
    clauses.push(`source_kind = $${params.length}`);
  }

  const rows = await db.query<{ title: string }>(
    `
      SELECT DISTINCT title
      FROM search_documents
      WHERE ${clauses.join(" AND ")}
      ORDER BY title ASC
      LIMIT 5
    `,
    params,
  );

  return { suggestions: rows.map((row) => row.title) };
}
