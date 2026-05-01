/**
 * OrgMemberRepository — auth domain.
 *
 * C6/C7: No raw SQL.
 * C8: needle-di @injectable().
 */

import { injectable } from "@needle-di/core";
import { EntityRepository, type InferEntity } from "@mikro-orm/postgresql";
import { OrgMemberSchema } from "../../entities/auth/OrgMember.ts";

@injectable()
export class OrgMemberRepository extends EntityRepository<
  InferEntity<typeof OrgMemberSchema>
> {}
