---
Status: implemented
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/01-trpc-router-scaffold.md, 13/issues/03-zod-schema-registry.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q28, Q-flag-granularity, C1, Q-cross-cut]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: [https://tools.ietf.org/html/rfc2104]
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

Schema migration + tRPC CRUD for outbound webhooks gated by `FULCRUM_FEATURES=outbound-webhooks`. Tables: `webhooks(id, org_id, name, url, secret, events_filter jsonb, enabled, created_at, updated_at, last_delivery_at)` + `webhook_deliveries(id, org_id, webhook_id, event_id, status, attempt, payload, response_code, error, next_retry_at, created_at)`. Composite indexes per Q22. tRPC sub-router `webhooks.*`: `list`, `get`, `create` (encrypts secret at rest via `nacl.secretbox` from Pillar 1 credentials table pattern), `update`, `delete` (cascades deliveries), `deliveries.list`, `deliveries.get`. Secrets masked on `list` output. `UNIQUE(org_id, name)`.

- **Web**: `/settings/webhooks` — CRUD list, secret displayed once on create, masked on list, delivery log table per webhook.
- **CLI**: `fulcrum webhooks list|create|update|delete|deliveries --json`; `fulcrum webhooks create --name n --url u --secret s`.
- **TUI**: Settings → Webhooks screen: list (`n`/`e`/`D`), delivery log pane, test-fire (`t`).

## Acceptance criteria

- [ ] Migration class `Migration<timestamp>` covering `Webhook` + `WebhookDelivery` entities idempotent (MikroORM snapshot diff); FK cascades verified; `status` enum constraint tested via `em.create(WebhookDelivery, { status: 'invalid' })` → validation error.
- [ ] `webhooks.create` encrypts `secret` via `nacl.secretbox`; `list` returns masked secret (`****`); raw secret retrievable only for HMAC signing (internal, never returned to caller).
- [ ] `webhooks.delete` cascades `webhook_deliveries` rows.
- [ ] `FULCRUM_FEATURES=outbound-webhooks` OFF → `webhooks.list` throws `FeatureDisabledError`; ON → returns rows.
- [ ] All three surfaces (web create form, `fulcrum webhooks create --json`, TUI create overlay) create same DB row; `fulcrum webhooks list --json` reflects it.
- [ ] Zod schemas: `WebhookInput`, `WebhookOutput`, `DeliveryOutput` all defined in schema registry.

## Blocked by

- 13/issues/01-trpc-router-scaffold.md
- 13/issues/03-zod-schema-registry.md

## Notes

P13.16–P13.17 maps to this slice. Dispatcher job is next slice (08).
