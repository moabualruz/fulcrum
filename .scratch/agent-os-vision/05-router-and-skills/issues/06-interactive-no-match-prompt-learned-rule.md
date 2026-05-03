---
Status: implemented
Owner: claude-orchestrator
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 04-auto-assign-tier1-tier2
ImplCommit: uncommitted-sandbox-blocked-git-index
ImplRuntime: codex
---

# Interactive no-match prompt + learned rule storage

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

When Tier 1 and Tier 2 both return null and `router-llm` flag is OFF, fire an interactive CLI prompt: "No rule matched for this task. Pick an agent or write a rule." The user's answer is stored as a new `routing_rules` row with `source='learned'` and a conditions_json derived from the task facts that triggered the prompt. On the next identical task, Tier 2 resolves via the learned rule without prompting. Wire into `auto-assign.ts` via a `promptForAgent` injectable (so tests can inject a mock).

## Acceptance criteria

- [x] Schema / module: `src/router/no-match-prompt.ts` exports `promptForAgent(facts: TaskFacts): Promise<string>` (reads from stdin / injectable in tests)
- [x] Schema / module: `learnRule(facts: TaskFacts, agent: string, orgId: string, projectId?: string): Promise<RoutingRule>` exported — creates a `routing_rules` row with `source='learned'`
- [x] Logic: `auto-assign.ts` calls prompt when `agentOverride` absent + rules-engine null + `router-llm` OFF
- [x] Logic: learned rule row has `source='learned'` and `enabled=true` and `conditions_json` derived from the task's `kind` field (minimum viable conditions)
- [x] Logic: second call with same task facts resolves via Tier 2 (no prompt) after rule is stored
- [x] Logic: `dryRun: true` → no prompt, no learned rule stored, returns null
- [x] Surfaces parity: injectable prompt function enables TUI/Web surfaces to substitute their own UI (documented in code comment)
- [x] Tests: mock prompt → learned rule stored in DB
- [x] Tests: second identical task → no prompt, rule matches
- [x] Tests: dryRun → no prompt, no rule

## Blocked by

- `04-auto-assign-tier1-tier2`

## Notes

Prompt implementation uses `@inquirer/prompts` (already in Pillar 1 likely). The injectable interface keeps this testable and allows TUI/Web to provide alternate input surfaces without re-implementing the rule-learning logic.
