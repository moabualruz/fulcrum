/**
 * UserRepository — auth domain.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable() pattern; extends EntityRepository<User>.
 *
 * Circular-import safety: User is imported as `type` only — the generic type
 * parameter is erased at runtime so no circular VALUE dependency is created.
 * User.ts imports this file as a value for @Entity({ repository: () => UserRepository }).
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { User } from "../../entities/auth/User.ts";

@injectable()
export class UserRepository extends EntityRepository<User> {}
