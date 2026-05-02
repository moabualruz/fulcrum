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

@injectable()
export class DocumentRepository extends EntityRepository<Document> {}
