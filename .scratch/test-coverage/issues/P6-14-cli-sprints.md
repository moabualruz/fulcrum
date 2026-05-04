---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/sprints.test.ts
Framework: bun-test
Blocked-by: [P1-01, P1-05, P2-08]
---

# CLI: fulcrum sprints

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — sprints`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — sprints`

## What to test

`src/cli/sprints.ts` — sprint management commands. Existing `src/cli/sprints.test.ts` exists; extend to cover `--json` output shapes, close dispositions, and round-trip against real PGlite.

## Setup

- Fresh `FULCRUM_HOME` tmpdir with seeded project
- Use real PGlite via in-process tRPC for round-trip tests

## Steps

1. `sprints create --name "Sprint 1" --start 2026-01-01 --end 2026-01-14 --json`
   - exit 0; JSON: `{ id, name, status, startDate, endDate }`
2. `sprints list --json`
   - exit 0; JSON array; new sprint present
3. `sprints get <id> --json`
   - exit 0; full sprint object
4. `sprints activate <id> --json`
   - exit 0; JSON: `{ ok: true, id, status: "active" }`
5. `sprints close <id> --disposition carry-over --json`
   - exit 0; JSON: `{ ok: true, id, status: "closed", incompleteDisposition: "carry-over", carried: number, dropped: number }`
6. `sprints close <id> --disposition drop --json`
   - exit 0; JSON includes `dropped: number`
7. Round-trip: create → activate → add tasks → close → verify task disposition
8. **Error cases:**
   - `sprints create` missing `--name` → exit non-zero, usage hint
   - `sprints activate <non-existent>` → exit non-zero; `{ error }`
   - `sprints close` missing `--disposition` → exit non-zero; lists valid dispositions

## Assertions

- [ ] `sprints create --json` shape: `{ id, name, status, startDate, endDate }`
- [ ] `sprints list --json` array contains created sprint
- [ ] `sprints activate --json` returns `{ ok, id, status: "active" }`
- [ ] `sprints close --disposition carry-over --json` returns `{ carried, dropped }` counts
- [ ] `sprints close --disposition drop --json` returns `dropped` count
- [ ] Round-trip: create → activate → close with carry-over → tasks re-appear
- [ ] Missing `--name` exits non-zero
- [ ] Non-existent sprint exits non-zero with `{ error }`
- [ ] Missing `--disposition` exits non-zero with valid dispositions listed
