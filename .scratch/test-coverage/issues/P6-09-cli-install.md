---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/install.test.ts
Framework: bun-test
Blocked-by: []
---

# CLI: fulcrum install/uninstall

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — install uninstall`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — install uninstall`

## What to test

`src/cli/install.ts` + `src/cli/uninstall.ts`. Existing `src/cli/install.test.ts` and `src/cli/uninstall.test.ts` exist; extend to cover `--json` output shapes and round-trip.

## Setup

```ts
import { run as installRun } from "../../src/cli/install.ts";
import { run as uninstallRun } from "../../src/cli/uninstall.ts";
// Use isolated FULCRUM_HOME tmpdir
```

## Steps

1. `install @fulcrum/biome --json`
   - exit 0; JSON: `{ ok: true, installed: [{ name, version, path }] }`
2. `install @fulcrum/biome --json` (already installed — idempotent)
   - exit 0; JSON: `{ ok: true, skipped: [{ name, reason: "already-installed" }] }` or equivalent
3. `install --list --json`
   - exit 0; JSON array: `[{ name, version }]`
4. `uninstall @fulcrum/biome --json`
   - exit 0; JSON: `{ ok: true, removed: [{ name }] }`
5. `install --list --json` after uninstall → package not in list
6. **Error cases:**
   - `install @fulcrum/non-existent --json` → exit non-zero; `{ error: string }`
   - `uninstall @fulcrum/never-installed --json` → exit non-zero; `{ error: string }`
   - `install` with no package name → exit non-zero, usage hint

## Assertions

- [ ] `install --json` returns `{ ok, installed: [{ name, version, path }] }`
- [ ] Second install is idempotent (exit 0)
- [ ] `install --list --json` array has name/version
- [ ] `uninstall --json` returns `{ ok, removed }`
- [ ] Post-uninstall list excludes package
- [ ] Non-existent package exits non-zero with `{ error }`
- [ ] Missing package name exits non-zero
