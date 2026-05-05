/**
 * SnapshotService — builds a serialized Orama JSON snapshot for SSR hydration.
 *
 * T-06-15: only documents belonging to the authenticated org are included.
 * The snapshot is generated server-side and transferred to the browser for
 * client-side full-text search via OramaIndex.hydrate().
 */

import { injectable as Injectable } from "@needle-di/core";
import type { ProductDb } from "../product-kernel/db/types.ts";

const SCHEMA = {
  title: "string",
  body: "string",
  kind: "enum",
  project: "string",
  status: "string",
  updatedAt: "number",
  entityId: "string",
} as const;

@Injectable()
export class SnapshotService {
  constructor(private readonly db: ProductDb) {}

  /** Build and serialize an Orama index from all search_documents for the org. */
  async buildSnapshot(orgId: string): Promise<string> {
    const rows = await this.fetchDocuments(orgId);
    const [{ create, insert }, { persist }] = await Promise.all([
      dynamicImport<OramaModule>("@orama/orama"),
      dynamicImport<OramaPersistenceModule>("@orama/plugin-data-persistence"),
    ]);
    const oramaDb = await create({ schema: SCHEMA });

    for (const row of rows) {
      await insert(oramaDb, {
        title: row.title ?? "",
        body: row.body ?? "",
        kind: row.entity_kind ?? "unknown",
        project: row.project_id ?? "",
        status: row.status ?? "",
        updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
        entityId: row.entity_id ?? row.id,
      });
    }

    return persist(oramaDb, "json");
  }

  private async fetchDocuments(orgId: string): Promise<SearchRow[]> {
    try {
      return await this.db.query<SearchRow>(
        `SELECT id, entity_kind, entity_id, title, body, project_id, status, updated_at
         FROM search_documents
         WHERE org_id = $1
         ORDER BY updated_at DESC
         LIMIT 5000`,
        [orgId],
      );
    } catch {
      // Table may not exist in all environments
      return [];
    }
  }
}

const dynamicImport = new Function("specifier", "return import(specifier)") as <T>(
  specifier: string,
) => Promise<T>;

interface OramaModule {
  create(options: { schema: typeof SCHEMA }): Promise<unknown>;
  insert(db: unknown, document: Record<string, unknown>): Promise<void>;
}

interface OramaPersistenceModule {
  persist(db: unknown, format: "json"): Promise<string>;
}

interface SearchRow {
  id: string;
  entity_kind: string | null;
  entity_id: string | null;
  title: string | null;
  body: string | null;
  project_id: string | null;
  status: string | null;
  updated_at: string | null;
}
