---
Status: ready-for-agent
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 11-dispatch-loop-happy-path, 12-otel-telemetry
---

# Conformance test suite: one test per REQUIRED SPEC.md item, zero todo

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement `src/orchestration/__tests__/symphony-conformance.test.ts`. One `it()` block per REQUIRED section in `vendor/openai-symphony/SPEC.md`. Each test verifies the specific behavioral invariant (not just "function exists"). CI configured to fail if any test is `.todo` or `.skip`. `bun test --reporter=verbose` output lists each REQUIRED section label as PASS/FAIL. Start RED (all `.todo`); turn GREEN slice-by-slice as implementation lands.

## Acceptance criteria
- [ ] Schema / state machine: claim-lock test, state-enum test, partial-index test all present
- [ ] Tracker adapter: `fetchCandidateIssues` ordering test, `fetchIssuesByStates` batch test, `fetchIssueStatesByIds` slim-shape test
- [ ] Dispatch loop / hooks: dispatch happy-path test, retry formula parameterized table test, stall detection mocked-clock test, hook-timeout test
- [ ] Surfaces (web/cli/tui parity): N/A (test suite is standalone)
- [ ] Tests: `bun test src/orchestration/__tests__/symphony-conformance.test.ts` exits 0 with zero `.todo`/`.skip` items; CI step asserts exit code 0; total test count ≥ number of REQUIRED SPEC.md sections
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: every REQUIRED section has at least one test ID mapped in conformance doc

## Blocked by
11-dispatch-loop-happy-path, 12-otel-telemetry

## Notes
RED-first development: write all tests as `.todo` in this slice, then turn each GREEN in the relevant implementation slice. `.todo` count must reach zero before merge to `main`.
