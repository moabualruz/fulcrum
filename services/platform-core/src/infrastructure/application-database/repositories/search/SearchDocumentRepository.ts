/**
 * SearchDocumentRepository — search domain (Pillar 11).
 *
 * Stub repository — Pillar 11 fills in domain methods (FTS, rerank, etc.).
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SearchDocument } from "../../entities/search/SearchDocument.ts";

@Injectable()
export class SearchDocumentRepository {
  constructor(
    @InjectRepository(SearchDocument)
    private readonly searchDocuments: Repository<SearchDocument>,
  ) {}
}
