/**
 * CredentialRepository — platform domain (Pillar 17 cross-cutting).
 *
 * C6/C7: No raw SQL; queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Credential>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Credential } from "../../entities/platform/Credential.ts";

@injectable()
export class CredentialRepository extends EntityRepository<Credential> {}
