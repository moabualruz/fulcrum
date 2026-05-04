---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/compress.test.ts
Framework: bun-test
Blocked-by: [P1-01]
---

# CLI: fulcrum compress

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — compress`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — compress`

## What to test

`src/cli/compress.ts` — `fulcrum compress`. No test currently exists.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Seed 10 tasks, 5 docs

## Steps

1. `compress --json`
   - exit 0
   - `--json` output is valid JSON containing `{ ok: true, beforeBytes: number, afterBytes: number }` or equivalent stats shape
2. After compress: verify all 10 tasks still queryable (no data loss)
3. After compress: verify all 5 docs still queryable
4. Run `compress --json` again → idempotent, exits 0
5. `compress` (no --json) → human output contains size info, exits 0
6. **Error case:** corrupt DB → `compress --json` exits non-zero, JSON contains `{ error: string }`

## Assertions

- [ ] `compress --json` exits 0
- [ ] JSON output contains before/after size stats
- [ ] Tasks + docs all queryable after compress (no data loss)
- [ ] Idempotent — safe to run twice
- [ ] Human output (no --json) includes size summary
- [ ] Corrupt DB exits non-zero with error JSON
