---
Status: implemented
Owner: codex-orchestrator
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 03-rules-engine-wrapper
---

# Repository hot-reload for routing rules

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement a repository-backed hot-reload hook in `src/router/rules-engine.ts` so that when `RoutingRuleRepository` creates, updates, deletes, enables, or disables a rule, the in-process rules cache is invalidated and rebuilt on the next `evaluateRules` call without a process restart. The notification path is a TS-side domain event (`RoutingRulesChanged`) emitted by the repository/service layer; no database triggers or query strings.

## Acceptance criteria

- [x] Schema / module: no new schema object required; `RoutingRuleRepository` emits `RoutingRulesChanged` after successful `em.flush()`.
- [x] Logic: `RulesEngine` class subscribes to `RoutingRulesChanged` via injectable event bus at startup.
- [x] Logic: handler sets a stale flag; next `evaluateRules` call reloads rules via `RoutingRuleRepository.findEnabledForDispatch(...)`.
- [x] Logic: rule inserted via `trpc.routing.create` is picked up by the next `evaluateRules` call in the same process within 100ms
- [x] Logic: process restart not required for new rules to take effect
- [x] Tests: integration test — create rule via repository → assert next `evaluateRules` call returns the new rule's agent (no restart)
- [x] Tests: assert no duplicate event-bus subscriptions on repeated `initialize()` calls

## Blocked by

- `03-rules-engine-wrapper`

## Notes

The stale-flag pattern is simpler and safer than rebuilding the Engine synchronously in the repository event handler, which could race with the same UnitOfWork flush.
