/**
 * OramaIndex — client-side Orama full-text search with SSR hydration.
 *
 * T-06-15: snapshot is generated per-org server-side; client only receives
 * documents belonging to the authenticated org.
 */

import { create, insert, search as oramaSearch, count } from "@orama/orama";

// ── Schema ────────────────────────────────────────────────────────────────────

const SCHEMA = {
  title: "string",
  body: "string",
  kind: "enum",
  project: "string",
  status: "string",
  updatedAt: "number",
  entityId: "string",
} as const;

type OramaSchema = typeof SCHEMA;
type OramaDB = Awaited<ReturnType<typeof create<OramaSchema>>>;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchDocument {
  title: string;
  body: string;
  kind: string;
  project: string;
  status: string;
  updatedAt: number;
  entityId: string;
}

export interface SearchOptions {
  facets?: boolean;
  where?: Record<string, unknown>;
  limit?: number;
}

export interface SearchHit {
  id: string;
  score: number;
  document: SearchDocument;
}

export interface SearchResult {
  hits: SearchHit[];
  count: number;
  facets?: Record<string, Record<string, number>>;
}

// ── OramaIndex ────────────────────────────────────────────────────────────────

export class OramaIndex {
  private db: OramaDB | null = null;
  private documents: SearchDocument[] = [];

  /** Hydrate from a serialized JSON snapshot (from search.snapshot tRPC endpoint). */
  async hydrate(snapshot: string): Promise<void> {
    if (!snapshot) {
      this.db = null;
      this.documents = [];
      return;
    }
    const docs = JSON.parse(snapshot) as SearchDocument[];
    await this.build(Array.isArray(docs) ? docs : []);
  }

  /** Build index from documents directly (for testing / bench). */
  async build(docs: SearchDocument[]): Promise<void> {
    this.db = await create({ schema: SCHEMA });
    this.documents = [...docs];
    for (const doc of docs) {
      await insert(this.db, doc as Record<string, unknown>);
    }
  }

  /** Full-text search with optional facets and where filters. */
  async search(term: string, options: SearchOptions = {}): Promise<SearchResult> {
    if (!this.db) return { hits: [], count: 0 };

    const result = await oramaSearch(this.db, {
      term,
      limit: options.limit ?? 20,
      // Facets only when requested — avoids cost on plain command palette queries
      facets: options.facets
        ? { kind: {}, project: {}, status: {} }
        : undefined,
      where: options.where as Record<string, unknown> | undefined,
    });

    return {
      hits: (result.hits ?? []) as SearchHit[],
      count: result.count ?? 0,
      facets: options.facets
        ? (result.facets as Record<string, Record<string, number>> | undefined)
        : undefined,
    };
  }

  /** Serialize current index to JSON string for SSR transfer. */
  async serialize(): Promise<string> {
    if (!this.db) return "";
    return JSON.stringify(this.documents);
  }

  /** Number of documents currently indexed. */
  async size(): Promise<number> {
    if (!this.db) return 0;
    return count(this.db);
  }

  /** True if index has been hydrated. */
  get ready(): boolean {
    return this.db !== null;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const oramaIndex = new OramaIndex();
