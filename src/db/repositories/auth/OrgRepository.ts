/**
 * OrgRepository — auth domain.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Org>.
 *
 * Circular-import safety: Org is imported as `type` only — generic type
 * parameter erased at runtime; no circular VALUE dependency.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Org } from "../../entities/auth/Org.ts";

@injectable()
export class OrgRepository extends EntityRepository<Org> {}
