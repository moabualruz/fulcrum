/**
 * UserRepository — auth domain.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable() pattern.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository, type InferEntity } from "@mikro-orm/postgresql";
import { UserSchema } from "../../entities/auth/User.ts";

@injectable()
export class UserRepository extends EntityRepository<
  InferEntity<typeof UserSchema>
> {}
