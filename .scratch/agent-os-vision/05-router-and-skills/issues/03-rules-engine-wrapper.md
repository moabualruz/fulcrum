---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 01-routing-rules-schema-migration
---

# json-rules-engine wrapper + rule evaluation core

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement `src/router/rules-engine.ts` — a wrapper around `json-rules-engine@^7` that loads `routing_rules` rows from the DB, evaluates them in priority order against a task facts object, and returns the matched agent name (or `null` on no match). Malformed `conditions_json` is caught per-rule: the rule is marked `enabled=false` in DB, an error is logged, and evaluation continues to the next rule. Returns `null` (not an error) when no rule fires.

## Acceptance criteria

- [ ] Schema / module: `src/router/rules-engine.ts` exports `evaluateRules(facts: TaskFacts, orgId: string, projectId?: string): Promise<string | null>`
- [ ] Schema / module: `TaskFacts` type exported — at minimum `{ task: { kind, priority, tags, title } }`
- [ ] Logic: rule with matching condition returns `action_agent`
- [ ] Logic: lower `priority` value fires before higher (ORDER BY priority ASC, first match wins)
- [ ] Logic: project-scoped rule (`project_id` set) beats global rule (`project_id IS NULL`) at equal priority
- [ ] Logic: malformed `conditions_json` → rule marked `enabled=false` in DB, caught without throwing, next rule evaluated
- [ ] Logic: no match → returns `null`
- [ ] Logic: empty rules table → returns `null`
- [ ] Surfaces parity: function is pure TS, no surface coupling
- [ ] Tests: unit tests covering match, no-match, priority order, malformed-rule auto-disable, project-scope win

## Blocked by

- `01-routing-rules-schema-migration`

## Notes

Install `json-rules-engine@^7` as a prod dependency. The `Engine` instance should be rebuilt from DB rows on each call (hot-reload handled in issue 11). ~200 LOC target for entire module.
