/**
 * WebhookSubscriptionRepository — flags domain (Pillar 10: Webhooks).
 *
 * Stub repository — Pillar 10 fills in dispatch logic once the
 * `outbound-webhooks` feature flag is enabled.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<WebhookSubscription>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { WebhookSubscription } from "../../entities/flags/WebhookSubscription.ts";

@injectable()
export class WebhookSubscriptionRepository extends EntityRepository<WebhookSubscription> {}
