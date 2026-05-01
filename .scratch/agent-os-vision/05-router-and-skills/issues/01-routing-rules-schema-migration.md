---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: None
---

# Routing rules schema migration + composite indexes

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Write and test the idempotent Drizzle migration that creates `routing_rules` with all columns, CHECK constraint on `source IN ('manual','learned','imported')`, and two composite indexes: `routing_rules_org_priority (org_id, priority, enabled)` and `routing_rules_org_project (org_id, project_id)`. Also extend `events` table payload convention to document `verb='routed'` with `{rule_id, source, agent, confidence}` fields (no schema column — payload is jsonb, just add a Zod validator + type for the payload shape).

## Acceptance criteria

- [ ] Schema / module: migration file creates `routing_rules` idempotently; re-running migration is a no-op
- [ ] Schema / module: `source` CHECK constraint rejects values outside `('manual','learned','imported')` at DB level
- [ ] Schema / module: `routing_rules_org_priority` composite index present; `EXPLAIN` on priority-ordered query uses it
- [ ] Schema / module: `routing_rules_org_project` composite index present
- [ ] Schema / module: `RoutingRuleRow` Drizzle schema + inferred TS types exported from `src/db/schema.ts`
- [ ] Schema / module: `RoutingEventPayload` Zod type (`rule_id`, `source`, `agent`, `confidence`) exported + validated
- [ ] Logic: `pg_get_constraintdef` test confirms CHECK constraint rejects bad `source` values
- [ ] Logic: duplicate `(org_id, slug)` on `routing_rules` not applicable — no unique slug; but duplicate name within org allowed by design (verified in test)
- [ ] Tests: migration idempotency test (apply twice → no error, same row count)
- [ ] Tests: constraint violation test for `source`
- [ ] Tests: index existence test via `pg_indexes` query

## Blocked by

None — can start immediately

## Notes

Rule eval order query: `WHERE org_id=$1 AND (project_id=$2 OR project_id IS NULL) AND enabled=true ORDER BY priority ASC`. Add this as a named query helper in `src/db/queries/routing.ts`.
