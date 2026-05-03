---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [04-fanout-worker.md, 07-quiet-hours.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [C1, Q26, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row)
Docs: []
---

# Gated: notify-webhook — HTTP POST + HMAC X-Fulcrum-Signature-256 + exponential backoff + max retry

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-32, T12-33)

## What to build
When `FULCRUM_FEATURES=notify-webhook` ON: `notify-deliver-webhook` graphile-worker task calls `@Injectable()` `WebhookNotificationDispatcher` (needle-di), which sends HTTP POST to `WebhookRuleConfig.url` with `X-Fulcrum-Signature-256` HMAC header (HMAC-SHA-256 of request body, signed with decrypted `WebhookRuleConfig.encryptedSecret`); exponential backoff on 4xx/5xx (max 5 retries; `NotificationDelivery.retryAfter`); 200 → `status='sent'`; max retries exceeded → `status='failed'`. Separate `notify-webhook-retry` cron job reschedules held deliveries. Flag OFF → no outbound requests.

## Acceptance criteria
- [ ] Schema migration: reads `WebhookRuleConfig` + `NotificationDelivery`.
- [ ] tRPC procedure / module: `notify-deliver-webhook` task; `src/notifications/channels/webhook.ts` exports `@Injectable()` dispatcher with HMAC signing.
- [ ] Web surface: webhook channel config page: URL input + secret input (masked); test delivery button.
- [ ] CLI command: `fulcrum notify channels config webhook --url https://... --secret mysecret`; `fulcrum notify channels test webhook` sends test POST.
- [ ] TUI screen: Settings channels shows webhook config + last delivery status.
- [ ] Tests: flag OFF → no HTTP requests; ON → POST sent with valid HMAC; 4xx → retry ≤5; 5xx backoff (exponential `min(5000*2^n, 60000)` ms); max retries → `status='failed'`; 200 → `status='sent'`; quiet-hours respected; RED→GREEN.

## Blocked by
- `04-fanout-worker.md` — fan-out enqueues `notify-deliver-webhook`.
- `07-quiet-hours.md` — quiet-hours suppression.
- `01-schema-migration.md` — `WebhookRuleConfig` entity.

## Notes / Tech-stack hints
- HMAC: `node:crypto` `createHmac('sha256', secret).update(body).digest('hex')`; header value: `sha256=<hex>`.
- Retry: graphile-worker `run_at` scheduling for `retry_after`; not a separate cron — use graphile-worker's built-in `attempts` and `max_attempts`.
- Secret storage: encrypted in `Credential` entity or `WebhookRuleConfig.encryptedSecret` (store nacl-encrypted, decrypt at delivery time).
