/**
 * OrgMemberRepository — auth domain.
 *
 * C6/C7: No raw SQL.
 * C8: needle-di @injectable(); extends EntityRepository<OrgMember>.
 *
 * Circular-import safety: OrgMember is imported as `type` only — generic type
 * parameter erased at runtime; no circular VALUE dependency.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { OrgMember } from "../../entities/auth/OrgMember.ts";

@injectable()
export class OrgMemberRepository extends EntityRepository<OrgMember> {}
