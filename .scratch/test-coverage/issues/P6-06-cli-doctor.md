---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/doctor.test.ts
Framework: bun-test
Blocked-by: [P1-01, P1-05]
---

# CLI: fulcrum doctor

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — doctor`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — doctor`

## What to test

`src/cli/doctor.ts` — `fulcrum doctor` modular orchestrator. Existing unit tests in `src/cli/doctor.test.ts`; extend to cover `--json` output shape, subsystem filtering, and exit codes.

## Setup

- Fresh `FULCRUM_HOME` tmpdir with fully initialized DB
- Use in-process handler; no subprocess needed

## Steps

1. `doctor --json`
   - exit 0 (when all subsystems healthy)
   - JSON array; each item: `{ name: string, status: "ok"|"warn"|"fail", message: string }`
   - validates against `DoctorCheckResultSchema` from `src/doctor/types.ts`
   - array contains ≥ 14 subsystem results
2. `doctor --subsystem db --json`
   - exit 0; array contains only subsystem matching "db"
3. `doctor --subsystem inference --json`
   - result present for inference subsystem
4. `doctor` (no --json, human output)
   - exit 0; stdout contains status badges (" OK ", "WARN", "FAIL")
5. **Exit code behavior:**
   - all checks "ok" → exit 0
   - any check "fail" → exit 1
   - only "warn" checks → exit 0 (warn is non-fatal)
6. **Error cases:**
   - `doctor --subsystem unknown-subsystem --json` → exit non-zero; `{ error: "unknown subsystem" }`

## Assertions

- [ ] `--json` array shape matches `DoctorCheckResultSchema[]`
- [ ] `--json` returns ≥ 14 subsystem results
- [ ] `--subsystem` flag filters to matching subsystem only
- [ ] Exit 0 when all ok, exit 1 when any fail
- [ ] Exit 0 when only warn (non-fatal)
- [ ] Unknown subsystem exits non-zero with error message
- [ ] Human output contains status badges
