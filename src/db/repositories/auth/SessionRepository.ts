/**
 * SessionRepository — auth domain.
 *
 * C6/C7: No raw SQL.
 * C8: needle-di @injectable().
 */

import { injectable } from "@needle-di/core";
import { EntityRepository, type InferEntity } from "@mikro-orm/postgresql";
import { SessionSchema } from "../../entities/auth/Session.ts";

@injectable()
export class SessionRepository extends EntityRepository<
  InferEntity<typeof SessionSchema>
> {}
