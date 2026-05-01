---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 03-rules-engine-wrapper
---

# PGlite LISTEN hot-reload for routing rules

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement PGlite `LISTEN` subscription in `src/router/rules-engine.ts` so that when a new `routing_rules` row is inserted or updated (via a `NOTIFY routing_rules_changed` trigger), the in-process rules cache is invalidated and rebuilt on the next `evaluateRules` call — without a process restart. Add the `NOTIFY` trigger to the schema migration.

## Acceptance criteria

- [ ] Schema / module: `routing_rules` table has an `AFTER INSERT OR UPDATE OR DELETE` trigger that executes `pg_notify('routing_rules_changed', NEW.org_id::text)` (or OLD for DELETE)
- [ ] Schema / module: trigger created in a new idempotent migration alongside `routing_rules` or as a separate migration
- [ ] Logic: `RulesEngine` class (or module) calls `pgClient.listen('routing_rules_changed', handler)` at startup
- [ ] Logic: handler sets a stale flag; next `evaluateRules` call reloads rules from DB
- [ ] Logic: rule inserted via `trpc.routing.create` is picked up by the next `evaluateRules` call in the same process within 100ms
- [ ] Logic: process restart not required for new rules to take effect
- [ ] Tests: integration test — insert rule via DB → assert next `evaluateRules` call returns the new rule's agent (no restart)
- [ ] Tests: assert no duplicate LISTEN subscriptions on repeated `initialize()` calls

## Blocked by

- `03-rules-engine-wrapper`

## Notes

PGlite supports `LISTEN`/`NOTIFY` via its `live` plugin or direct SQL. Check which API the Pillar 1 foundation exposes and reuse the same connection. The stale-flag pattern is simpler and safer than rebuilding the Engine synchronously in the NOTIFY handler (which could race).
