/**
 * TelemetryEventRepository — platform domain (Pillar 17 cross-cutting).
 *
 * C6/C7: No raw SQL; queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<TelemetryEvent>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { TelemetryEvent } from "../../entities/platform/TelemetryEvent.ts";

@injectable()
export class TelemetryEventRepository extends EntityRepository<TelemetryEvent> {}
