/**
 * DocumentRepository — docs domain (Pillar 7).
 *
 * Stub repository — Pillar 7 fills in domain methods.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Document>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Document } from "../../entities/docs/Document.ts";
import { cosineSimilarity } from "../../../memory/retrieval/hybrid-scoring.ts";

@injectable()
export class DocumentRepository extends EntityRepository<Document> {
  /**
   * Re-rank linked docs by cosine similarity to a query embedding.
   * Used by assembler slice 2 when wikilinks > 5; gated on embeddings flag.
   * Docs without embeddings sort to end, preserving original order among themselves.
   */
  reRankByCosine(docs: Document[], queryEmbedding: readonly number[]): Document[] {
    type Scored = { doc: Document; cosine: number; originalIndex: number };
    const scored: Scored[] = docs.map((doc, i) => ({
      doc,
      cosine: doc.embedding ? cosineSimilarity(queryEmbedding as number[], doc.embedding) : -Infinity,
      originalIndex: i,
    }));

    scored.sort((a, b) => {
      // Docs with embeddings first, sorted by cosine DESC
      if (a.cosine !== -Infinity && b.cosine !== -Infinity) {
        return b.cosine - a.cosine || a.originalIndex - b.originalIndex;
      }
      if (a.cosine !== -Infinity) return -1;
      if (b.cosine !== -Infinity) return 1;
      return a.originalIndex - b.originalIndex;
    });

    return scored.map((s) => s.doc);
  }
}
