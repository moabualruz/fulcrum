/**
 * NotificationRuleRepository — flags domain (Pillar 12: Notifications).
 *
 * Stub repository — Pillar 12 fills in dispatch logic once the
 * `notify-email`/`notify-webhook`/`notify-slack` feature flags are enabled.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<NotificationRule>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { NotificationRule } from "../../entities/flags/NotificationRule.ts";

@injectable()
export class NotificationRuleRepository extends EntityRepository<NotificationRule> {}
