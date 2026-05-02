/**
 * SearchDocumentRepository — search domain (Pillar 11).
 *
 * Stub repository — Pillar 11 fills in domain methods (FTS, rerank, etc.).
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<SearchDocument>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { SearchDocument } from "../../entities/search/SearchDocument.ts";

@injectable()
export class SearchDocumentRepository extends EntityRepository<SearchDocument> {}
