/**
 * EventRepository — core domain.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Event>.
 *
 * Circular-import safety: Event is imported as `type` only.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Event } from "../../entities/core/Event.ts";

@injectable()
export class EventRepository extends EntityRepository<Event> {}
