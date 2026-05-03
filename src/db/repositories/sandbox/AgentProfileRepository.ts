/**
 * AgentProfileRepository — persisted agent CLI profile registry.
 *
 * C6/C7: no raw SQL; all writes through EntityManager + repository methods.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { AgentProfile } from "../../entities/sandbox/AgentProfile.ts";

@injectable()
export class AgentProfileRepository extends EntityRepository<AgentProfile> {}
