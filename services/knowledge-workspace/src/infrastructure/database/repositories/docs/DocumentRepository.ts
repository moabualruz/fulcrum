/**
 * DocumentRepository.
 *
 * Document-specific query helpers backed by TypeORM Repository.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Document } from "@knowledge-workspace/infrastructure/database/entities/docs/Document.ts";
import { cosineSimilarity } from "@knowledge-workspace/application/memory/retrieval/hybrid-scoring.ts";

@Injectable()
export class DocumentRepository {
  constructor(
    @InjectRepository(Document)
    private readonly documents: Repository<Document>,
  ) {}

  /**
   * Fetch context summaries for a project for context bundle assembly.
   * Returns documents with context_summary populated, ordered by updatedAt DESC.
   */
  async getContextSummariesForProject(projectId: string): Promise<Document[]> {
    return this.documents.find({
      where: { projectId },
      order: { updatedAt: "DESC" },
    });
  }

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
