/**
 * SchemaMigrationRepository — migration audit ledger domain.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<SchemaMigration>.
 *
 * Circular-import safety: SchemaMigration is imported as `type` only.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { SchemaMigration } from "../entities/SchemaMigration.ts";

@injectable()
export class SchemaMigrationRepository extends EntityRepository<SchemaMigration> {}
