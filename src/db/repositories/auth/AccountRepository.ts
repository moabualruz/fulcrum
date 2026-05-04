/**
 * AccountRepository — auth domain.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Account>.
 *
 * Circular-import safety: Account is imported as `type` only — the generic type
 * parameter is erased at runtime so no circular VALUE dependency is created.
 * Account.ts imports this file as a value for @Entity({ repository: () => AccountRepository }).
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Account } from "../../entities/auth/Account.ts";

@injectable()
export class AccountRepository extends EntityRepository<Account> {}
