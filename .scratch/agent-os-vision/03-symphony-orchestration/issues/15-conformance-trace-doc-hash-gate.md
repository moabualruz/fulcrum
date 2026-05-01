---
Status: ready-for-agent
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 14-conformance-test-suite
---

# Conformance trace doc + hash gate: gen-conformance-trace.ts + pre-commit hook

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement `scripts/gen-conformance-trace.ts`: scans `orchestrator.ts`, `tracker.ts`, `hooks.ts`, `workspace.ts`, `prompt.ts`, `retry.ts` for exported function names; maps each to SPEC.md REQUIRED section via a config table; writes `docs/symphony-conformance.md` with `file:function → SPEC section` table; writes SHA-256 of the generated doc to `.symphony-conformance.lock`. CI step: `bun run gen-conformance-trace && git diff --exit-code .symphony-conformance.lock` — fails if lock drifts. Pre-commit hook runs `gen-conformance-trace` and `git add docs/symphony-conformance.md .symphony-conformance.lock` automatically.

## Acceptance criteria
- [ ] Schema / state machine: N/A
- [ ] Tracker adapter: N/A
- [ ] Dispatch loop / hooks: removing any exported function from the five core files causes `gen-conformance-trace` to fail or produce a changed lock hash
- [ ] Surfaces (web/cli/tui parity): `fulcrum symphony conformance --verbose` runs `gen-conformance-trace` and prints per-section PASS/FAIL
- [ ] Tests: CI step exits non-zero when `.symphony-conformance.lock` is stale; pre-commit hook updates lock before commit
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: doc fully populated; lock file committed; zero drift on clean repo

## Blocked by
14-conformance-test-suite

## Notes
Pre-commit hook added to `.husky/pre-commit` (or equivalent). Lock file is a 64-char hex SHA-256. Removing a mapped function must produce a different hash — the mapping table in the script ensures this.
