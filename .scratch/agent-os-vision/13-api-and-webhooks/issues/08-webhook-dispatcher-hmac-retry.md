---
Status: implemented
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/07-webhook-schema-and-trpc.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q28, Q-flag-granularity, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: [https://tools.ietf.org/html/rfc2104, https://worker.graphile.org]
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

graphile-worker job `webhook-dispatcher` that fires on every `events` row insert via `pg_notify`. The job: (1) queries `webhooks WHERE events_filter matches AND enabled=true`; (2) for each match, inserts `webhook_deliveries(status='pending')`; (3) POSTs to the webhook URL with `HMAC-SHA-256` signature header `X-Fulcrum-Signature-256` (signed via `node:crypto`) and idempotency key `X-Fulcrum-Delivery-Id` (delivery UUID). On 2xx: update delivery `status='sent'` + `webhooks.last_delivery_at`. On error: exponential backoff `min(2^attempt * 1000ms, 32000ms)`; max 5 attempts; 5th failure → `status='failed'`. Test-fire: `webhooks.testFire(id)` sends synthetic `ping` payload.

- **Web**: `/settings/webhooks` delivery log updates live (subscription or poll).
- **CLI**: `fulcrum webhooks test <id>` → delivery row created; `fulcrum webhooks deliveries <id> --json` shows status.
- **TUI**: Settings → Webhooks `t` test-fire → status bar update.

## Acceptance criteria

- [ ] Task status change event → matching webhook delivery fires within 2s.
- [ ] `X-Fulcrum-Signature-256` header: `HMAC-SHA256(secret, body)` in hex; verified by test with known key+payload.
- [ ] Empty payload signed correctly; wrong secret fails verification (test).
- [ ] Retry sequence: 1st fail → `next_retry_at = now()+1s`; 5th fail → `status='failed'`; 2xx on retry 3 → `status='sent'`.
- [ ] Idempotency: same `X-Fulcrum-Delivery-Id` UUID on every retry attempt.
- [ ] `events_filter {}` matches all events; specific filter skips non-matching event types (unit test).
- [ ] `fulcrum webhooks test <id> --json`, web test-fire button, TUI `t` key all create delivery row with `payload.type='ping'`.
- [ ] Doctor check `pending-delivery-backlog` warns at >100 retrying deliveries; fails at >1000.

## Blocked by

- 13/issues/07-webhook-schema-and-trpc.md

## Notes

P13.18–P13.22 maps to this slice. HMAC large-payload concern: if signing causes CPU saturation, offload to Bun `Worker` thread (same `node:crypto` API).
