---
Status: ready-for-agent
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 09-sandbox-runner-nosandbox-happy-path
---

# Iteration loop + hard cap enforcement

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Extend `sandbox-runner.ts` with the iteration loop: after each agent turn, check for a standalone COMPLETE signal in the final output line; if absent, append context and re-invoke up to `agentProfile.maxIterations`. Also enforce `FULCRUM_MAX_TOKENS_PER_RUN` (default 200000) as a secondary cap. Write `iteration_count` and `exit_reason` to the `agent_runs` DB row. The COMPLETE signal must appear as a standalone final line — a mid-content occurrence must not terminate the loop.

## Acceptance criteria

- [ ] Adapter / profile: iteration loop in `runAgent()` loops while COMPLETE signal absent and `iterationCount < agentProfile.maxIterations`; each turn appends context bundle to prompt.
- [ ] Lifecycle integration: `exitReason: 'max_iterations'` set on `AgentRunResult` when cap hit; `exitReason: 'complete'` when COMPLETE signal received; `iteration_count` written to `agent_runs` DB row.
- [ ] Lifecycle integration: `FULCRUM_MAX_TOKENS_PER_RUN` env var read at startup; default `200000`; cap enforced across all turns; `exitReason: 'token_cap'` when hit.
- [ ] Surfaces parity: `iteration_count` and `exit_reason` columns visible in DB; CLI `fulcrum runs show <id> --json` includes both fields.
- [ ] Tests: test 1 — stub agent never emits COMPLETE → terminates at `maxIterations: 3`; `iteration_count = 3`; `exitReason = 'max_iterations'`. Test 2 — stub emits COMPLETE mid-content (`"some text COMPLETE more text"`) → loop does NOT terminate; terminates only when COMPLETE appears as standalone final line. Test 3 — stub emits COMPLETE on turn 2 of 10-cap run → `iteration_count = 2`; `exitReason = 'complete'`.

## Blocked by

09-sandbox-runner-nosandbox-happy-path

## Notes

"Standalone final line" means the COMPLETE token appears alone on the last non-empty line of the agent's output for that turn (trim whitespace; case-sensitive). The exact COMPLETE signal format should be documented in `src/orchestration/CONTEXT.md` or a `PROTOCOL.md` doc so agent profiles can instruct agents on the expected format.
