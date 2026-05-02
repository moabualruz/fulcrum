---
Status: integration-review
Owner: codex-orchestrator
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 03-rules-engine-wrapper
---

# auto-assign.ts — Tier 1 explicit override + Tier 2 rules evaluation

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement `src/router/auto-assign.ts` — the top-level dispatcher that runs Tier 1 (explicit `--agent` flag wins unconditionally) then Tier 2 (rules-engine match). Returns a `RoutingDecision` object. When both tiers return null, returns `null` from this function (the interactive no-match prompt is handled in the next issue). Tier 3 LLM fallback is handled in issue 10 (gated).

## Acceptance criteria

- [ ] Schema / module: `src/router/auto-assign.ts` exports `autoAssign(input: AutoAssignInput): Promise<RoutingDecision | null>`
- [ ] Schema / module: `AutoAssignInput` = `{ agentOverride?: string; taskFacts: TaskFacts; orgId: string; projectId?: string; dryRun?: boolean }`
- [ ] Schema / module: `RoutingDecision` = `{ ruleId: string | null; source: 'explicit'|'rule'|'learned'|'llm-fallback'|'manual'; agent: string; confidence: number | null }`
- [ ] Logic: `agentOverride` set → returns `{ source: 'explicit', agent: agentOverride, ruleId: null, confidence: 1.0 }` without calling rules-engine
- [ ] Logic: rule match → returns `{ source: 'rule', agent, ruleId, confidence: 1.0 }`
- [ ] Logic: no match → returns `null`
- [ ] Logic: `dryRun: true` → no `events` row written (telemetry tested in issue 05)
- [ ] Tests: explicit override wins even when matching rule exists
- [ ] Tests: rule match path
- [ ] Tests: null path
- [ ] Tests: dryRun suppresses events write

## Blocked by

- `03-rules-engine-wrapper`

## Notes

`RoutingDecision` type should live in `src/router/types.ts` and be imported by all router modules. Keep `auto-assign.ts` thin — delegate to `rules-engine.ts` for evaluation logic.
