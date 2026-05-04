---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/skills.test.ts
Framework: bun-test
Blocked-by: [P6-09]
---

# CLI: fulcrum skills

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — skills`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — skills`

## What to test

`src/cli/skills.ts` — skill management commands. Existing `src/cli/skills.test.ts` exists; extend to cover `--json` output shapes, conflict resolution, and round-trips.

## Setup

- `FULCRUM_HOME` with 2 pre-installed skill fixtures
- Mock upstream registry for sync/upgrade tests

## Steps

1. `skills list --json`
   - exit 0; JSON array: `[{ slug, version, source, hashVerified, enabledAgents, upstreamConflict }]`
2. `skills sync --json`
   - exit 0; JSON: `{ ok: true, merged: number, conflicts: number }`
3. `skills upgrade <slug> --json`
   - exit 0; JSON: `{ ok: true, slug, version }` (new version)
4. `skills uninstall <slug> --json`
   - exit 0; JSON: `{ ok: true, slug }`
5. Conflict resolution:
   - `skills resolve <slug> --strategy keep-local --json` → `{ ok, slug, strategy }`
   - `skills resolve <slug> --strategy use-upstream --json` → `{ ok, slug, strategy }`
6. `skills enable <slug>` → `skills list --json` shows skill enabled
7. `skills disable <slug>` → `skills list --json` shows skill disabled
8. **Error cases:**
   - `skills upgrade <non-existent>` → exit non-zero; `{ error }`
   - `skills uninstall <non-existent>` → exit non-zero; `{ error }`
   - `skills resolve` missing `--strategy` → exit non-zero
   - `skills resolve <slug> --strategy invalid` → exit non-zero, lists valid strategies

## Assertions

- [ ] `skills list --json` array: `{ slug, version, source, hashVerified, enabledAgents, upstreamConflict }`
- [ ] `skills sync --json` returns `{ merged, conflicts }` counts
- [ ] `skills upgrade --json` returns new version
- [ ] `skills uninstall --json` returns `{ ok, slug }`
- [ ] Enable/disable reflected in list
- [ ] Resolve with keep-local/use-upstream returns `{ ok, slug, strategy }`
- [ ] Non-existent slug exits non-zero with `{ error }`
- [ ] Invalid strategy exits non-zero with valid strategy list
