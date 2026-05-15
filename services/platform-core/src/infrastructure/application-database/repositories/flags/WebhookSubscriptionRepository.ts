/**
 * WebhookSubscriptionRepository — flags domain (Pillar 10: Webhooks).
 *
 * Stub repository — Pillar 10 fills in dispatch logic once the
 * `outbound-webhooks` feature flag is enabled.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WebhookSubscription } from "../../entities/flags/WebhookSubscription.ts";

@Injectable()
export class WebhookSubscriptionRepository {
  constructor(
    @InjectRepository(WebhookSubscription)
    private readonly webhookSubscriptions: Repository<WebhookSubscription>,
  ) {}
}
