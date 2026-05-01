/**
 * InvitationRepository — auth domain.
 *
 * C6/C7: No raw SQL.
 * C8: needle-di @injectable().
 */

import { injectable } from "@needle-di/core";
import { EntityRepository, type InferEntity } from "@mikro-orm/postgresql";
import { InvitationSchema } from "../../entities/auth/Invitation.ts";

@injectable()
export class InvitationRepository extends EntityRepository<
  InferEntity<typeof InvitationSchema>
> {}
