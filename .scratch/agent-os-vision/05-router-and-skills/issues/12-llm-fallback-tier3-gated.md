---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 04-auto-assign-tier1-tier2
---

# LLM fallback Tier 3 (FULCRUM_FEATURES=router-llm) + backend selection

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement the gated Tier 3 LLM fallback in `src/router/llm-fallback.ts`. When `FULCRUM_FEATURES=router-llm` is ON and Tier 2 returns null, call the inference sidecar (Pillar 2 Unix socket JSON-RPC) with a classifier prompt. Parse structured output `{ agent, confidence, reasoning }`. Wire into `auto-assign.ts` between Tier 2 null and the interactive prompt. Support backend selection via `FULCRUM_FEATURES=router-llm:<backend>` where backend is `embedded` (default) / `ollama` / `lm-studio` / `openai-compatible:url:key`. When flag is OFF, sidecar is never called.

## Acceptance criteria

- [ ] Schema / module: `src/router/llm-fallback.ts` exports `llmFallback(facts: TaskFacts, orgId: string): Promise<RoutingDecision | null>`
- [ ] Schema / module: backend selector reads `FULCRUM_FEATURES` env; defaults to `embedded`
- [ ] Logic: flag ON + sidecar mock returns `{ agent, confidence }` → `RoutingDecision` with `source='llm-fallback'`, `confidence` non-null
- [ ] Logic: flag OFF → `llmFallback` is never called; interactive prompt path used instead
- [ ] Logic: sidecar unreachable (health check fails) → log warning, fall back to interactive prompt, do not fail task dispatch
- [ ] Logic: structured output from sidecar validated against Zod schema; invalid response → null (fall through to prompt)
- [ ] Logic: telemetry row written with `source='llm-fallback'` and `confidence` populated
- [ ] Logic: `backend=ollama` → request sent to Ollama local endpoint instead of Unix socket
- [ ] Surfaces parity: flag-gated; no surface changes needed when flag OFF
- [ ] Tests: flag ON + mock sidecar → `source='llm-fallback'` in returned decision and events row
- [ ] Tests: flag OFF → sidecar mock never called
- [ ] Tests: sidecar timeout/error → graceful fallback to prompt path

## Blocked by

- `04-auto-assign-tier1-tier2`

## Notes

Inference sidecar API is defined by Pillar 2. This issue should mock the sidecar via a test stub at the Unix socket interface. The classifier prompt: "Given this task, which agent should handle it? Agents: [list]. Task: [facts JSON]. Respond with JSON: {agent, confidence (0-1), reasoning}." Keep prompt under 512 tokens.
