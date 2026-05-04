/**
 * SessionRepository — auth domain.
 *
 * C6/C7: No raw SQL.
 * C8: needle-di @injectable(); extends EntityRepository<Session>.
 *
 * Circular-import safety: Session is imported as `type` only — generic type
 * parameter erased at runtime; no circular VALUE dependency.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Session } from "../../entities/auth/Session.ts";

@injectable()
export class SessionRepository extends EntityRepository<Session> {}
