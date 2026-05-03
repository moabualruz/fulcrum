---
Status: implemented
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 04-auto-assign-tier1-tier2
---

# Routing telemetry — events row per dispatch decision

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement `src/router/telemetry.ts` that writes exactly one `events` row per non-dryRun `autoAssign` call. The row uses `verb='routed'` and a `payload` matching `RoutingEventPayload` Zod type (`{ rule_id, source, agent, confidence }`). Wire telemetry into `auto-assign.ts`. Verify `dryRun: true` writes zero rows and that every real dispatch (explicit override, rule match, learned, llm-fallback) correctly sets `source`.

## Acceptance criteria

- [x] Schema / module: `src/router/telemetry.ts` exports `recordRoutingEvent(decision: RoutingDecision, taskId: string, orgId: string, dryRun: boolean): Promise<void>`
- [x] Logic: non-dryRun call → inserts one `events` row with `verb='routed'` and correct payload fields
- [x] Logic: `dryRun: true` → zero rows inserted
- [x] Logic: `source='explicit'` → `rule_id` is `null` in payload
- [x] Logic: `source='rule'` → `rule_id` is the matched rule's UUID
- [x] Logic: `source='llm-fallback'` → `confidence` non-null (stubbed for now; exercised fully in issue 10)
- [x] Surfaces parity: telemetry module is surface-agnostic; called by `auto-assign.ts`
- [x] Tests: assert exact `events` row count (1) after dispatch
- [x] Tests: assert `events` row count (0) after dryRun dispatch
- [x] Tests: payload shape validated against `RoutingEventPayload` Zod type in test assertions

## Blocked by

- `04-auto-assign-tier1-tier2`

## Notes

Reuse the existing `events` table from Pillar 1. No new schema columns — `org_id` was added by the Q23 migration; `verb` and `payload` columns already exist.
