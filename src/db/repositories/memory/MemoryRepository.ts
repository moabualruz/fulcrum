/**
 * MemoryRepository — memory domain (Pillar 8).
 *
 * Stub repository — Pillar 8 fills in domain methods.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Memory>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Memory } from "../../entities/memory/Memory.ts";

@injectable()
export class MemoryRepository extends EntityRepository<Memory> {}
