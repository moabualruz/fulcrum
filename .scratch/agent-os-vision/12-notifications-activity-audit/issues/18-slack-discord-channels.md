---
Status: completed
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

# Gated: notify-slack (Block Kit) + notify-discord (embed POST) — fetch + quiet-hours + rate-limit backoff

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-34, T12-35)

## What to build
Two delivery channel implementations, each gated independently:

**`notify-slack`** (`FULCRUM_FEATURES=notify-slack`): `notify-deliver-slack` graphile-worker task; `@Injectable()` `SlackNotificationDispatcher` (needle-di) uses `fetch` POST to `SLACK_WEBHOOK_URL` with Slack Block Kit JSON; quiet-hours respected; rate-limit backoff same as webhook channel; `status='sent'|'failed'|'suppressed'`.

**`notify-discord`** (`FULCRUM_FEATURES=notify-discord`): `notify-deliver-discord` task; `@Injectable()` `DiscordNotificationDispatcher` uses `fetch` POST to Discord webhook URL with embed JSON; same patterns. Discord rate-limit (429) → exponential backoff.

Both: flag OFF → no outbound requests; channels config page shows URL input; test delivery button.

## Acceptance criteria
- [ ] Schema migration: reads `NotificationDelivery`; Slack/Discord URL stored in `WebhookRuleConfig` (reuse entity with `channel='slack'|'discord'`).
- [ ] tRPC procedure / module: two graphile-worker tasks; `src/notifications/channels/slack.ts` + `discord.ts` export `@Injectable()` dispatchers.
- [ ] Web surface: channels config page shows Slack + Discord URL inputs; test delivery buttons.
- [ ] CLI command: `fulcrum notify channels config slack --url https://hooks.slack.com/...`; `fulcrum notify channels test slack`.
- [ ] TUI screen: Settings channels shows Slack/Discord config + last status.
- [ ] Tests: notify-slack OFF → no fetch; ON → Block Kit POST sent to mocked URL; quiet-hours respected; rate-limit 429 → backoff; notify-discord same pattern; RED→GREEN.

## Blocked by
- `04-fanout-worker.md` — fan-out enqueues delivery tasks.
- `07-quiet-hours.md` — quiet-hours suppression.

## Notes / Tech-stack hints
- Slack Block Kit format: `{ "blocks": [{ "type": "section", "text": { "type": "mrkdwn", "text": "*{{title}}*\n{{body}}" } }] }`.
- Discord embed: `{ "embeds": [{ "title": "{{title}}", "description": "{{body}}", "color": 0x5865F2 }] }`.
- Failure gate: Slack deprecates incoming webhooks → switch to OAuth app via `notify-slack-api` flag.
- Rate limit: Slack has ~1 msg/sec per webhook; Discord has 5 req/sec; implement token bucket in memory or persist `NotificationDelivery.retryAfter`.
