/**
 * VerificationRepository — auth domain.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Verification>.
 *
 * Circular-import safety: Verification is imported as `type` only — the generic type
 * parameter is erased at runtime so no circular VALUE dependency is created.
 * Verification.ts imports this file as a value for @Entity({ repository: () => VerificationRepository }).
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Verification } from "../../entities/auth/Verification.ts";

@injectable()
export class VerificationRepository extends EntityRepository<Verification> {}
