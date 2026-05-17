/**
 * NotificationRuleRepository — flags domain (Pillar 12: Notifications).
 *
 * Stub repository — Pillar 12 fills in dispatch logic once the
 * `notify-email`/`notify-webhook`/`notify-slack` feature flags are enabled.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NotificationRule } from "../../entities/flags/NotificationRule.ts";

@Injectable()
export class NotificationRuleRepository {
  constructor(
    @InjectRepository(NotificationRule)
    private readonly notificationRules: Repository<NotificationRule>,
  ) {}
}
