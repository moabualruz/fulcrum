---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 05-routing-telemetry, 06-interactive-no-match-prompt-learned-rule
---

# tRPC routing.* procedures (list/get/create/update/delete/test/dryRun)

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement all seven `routing.*` tRPC procedures in `src/server/routers/routing.ts`. `routing.create` and `routing.update` validate `conditions_json` against `json-rules-engine`'s condition schema at write time (reject unknown operators). `routing.test` runs `autoAssign` against a real saved task. `routing.dryRun` runs against an ad-hoc task JSON payload and writes zero telemetry rows.

## Acceptance criteria

- [ ] Schema / module: `routing.list`, `routing.get`, `routing.create`, `routing.update`, `routing.delete`, `routing.test`, `routing.dryRun` all implemented with Zod input/output schemas
- [ ] Logic: `routing.list` filters by `orgId` + optional `projectId`; returns rules ordered by priority ASC
- [ ] Logic: `routing.create` + `routing.update` reject malformed `conditions_json` (unknown operator → `TRPCError BAD_REQUEST`)
- [ ] Logic: `routing.delete` removes rule; subsequent `routing.list` does not include it
- [ ] Logic: `routing.test` with `taskId` → returns `RoutingDecision` matching `autoAssign` output; writes one `events` row
- [ ] Logic: `routing.dryRun` with `taskJson` → returns `RoutingDecision`; writes zero `events` rows
- [ ] Surfaces parity: all procedures accessible from Web, CLI (via codegen), and TUI
- [ ] Tests: full CRUD round-trip test (create → list → get → update → delete)
- [ ] Tests: `routing.test` returns correct decision for a rule-matching task
- [ ] Tests: `routing.dryRun` returns decision + no events row
- [ ] Tests: malformed `conditions_json` rejected at create/update

## Blocked by

- `05-routing-telemetry`
- `06-interactive-no-match-prompt-learned-rule`

## Notes

`RoutingDecision` output type is the same Zod schema used by `auto-assign.ts`. Export `routingRouter` and mount it in the main tRPC app router.
