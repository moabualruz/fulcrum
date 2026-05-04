/**
 * InvitationRepository — auth domain.
 *
 * C6/C7: No raw SQL.
 * C8: needle-di @injectable(); extends EntityRepository<Invitation>.
 *
 * Circular-import safety: Invitation is imported as `type` only — generic type
 * parameter erased at runtime; no circular VALUE dependency.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Invitation } from "../../entities/auth/Invitation.ts";

@injectable()
export class InvitationRepository extends EntityRepository<Invitation> {}
