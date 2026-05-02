---
Status: implemented
Triage: AFK
Owner: codex-orchestrator
Pillar: 05-router-and-skills
Blocked-by: None
ReviewGate: 2026-05-02T09:59:24Z — Claude adversarial review review-moo61qcn-s8r5vi SPEC PASS / QUALITY CHANGES_REQUIRED: routing_rules org FK missing ON DELETE CASCADE.
---

# Routing rules entity + migration class + composite indexes

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Write and test `RoutingRule` as a MikroORM v7 `@Entity({ tableName: 'routing_rules' })` class plus generated migration class `Migration<timestamp>`. The entity includes enum validation for `source` (`manual|learned|imported`) and decorator indexes `routing_rules_org_priority` (`org`, `priority`, `enabled`) and `routing_rules_org_project` (`org`, `project`). Also extend the `events` payload convention to document `verb='routed'` with `{rule_id, source, agent, confidence}` fields (no schema column — payload is jsonb, just add a Zod validator + type for the payload shape).

## Acceptance criteria

- [ ] Schema / module: `RoutingRule` entity exported from `src/db/entities/router/RoutingRule.ts`; generated `Migration<timestamp>` applies idempotently.
- [ ] Schema / module: `RoutingRuleSource` enum rejects values outside `manual|learned|imported`.
- [ ] Schema / module: `routing_rules_org_priority` decorator index present in MikroORM metadata.
- [ ] Schema / module: `routing_rules_org_project` decorator index present in MikroORM metadata.
- [ ] Schema / module: `RoutingRuleRepository` exported from `src/db/repositories/router/RoutingRuleRepository.ts`.
- [ ] Schema / module: `RoutingEventPayload` Zod type (`rule_id`, `source`, `agent`, `confidence`) exported + validated
- [ ] Logic: repository write test confirms bad `source` is rejected.
- [ ] Logic: duplicate `(org_id, slug)` on `routing_rules` not applicable — no unique slug; but duplicate name within org allowed by design (verified in test)
- [ ] Tests: migration idempotency test (apply twice → no error, same row count)
- [ ] Tests: constraint violation test for `source`
- [ ] Tests: decorator metadata test verifies both indexes without catalog queries.

## Blocked by

None — can start immediately

## Notes

Rule eval order lives in `RoutingRuleRepository.findEnabledForDispatch(orgId, projectId)` using MikroORM query builder and priority ordering.
