---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/mcp.test.ts
Framework: bun-test
Blocked-by: [P1-01, P1-05]
---

# CLI: fulcrum mcp

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — mcp`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — mcp`

## What to test

`src/cli/mcp.ts` + `src/cli/mcp-cmd.ts` + `src/cli/mcp-registry.ts`. Existing unit tests present; extend to cover `--json` output shapes, round-trip, and error cases.

## Setup

```ts
import { run as mcpRun } from "../../src/cli/mcp.ts";
// Use isolated FULCRUM_HOME tmpdir
```

## Steps

1. `mcp list --json`
   - exit 0; JSON array: `[{ id, name, url, enabled, status }]`
2. `mcp add --name test-mcp --url http://localhost:9999 --json`
   - exit 0; JSON: `{ ok: true, id, name, url }`
3. `mcp get <id> --json`
   - exit 0; JSON matches add output shape
4. `mcp enable <id> --json`
   - exit 0; JSON `{ ok: true, id, enabled: true }`
5. `mcp disable <id> --json`
   - exit 0; JSON `{ ok: true, id, enabled: false }`
6. `mcp remove <id> --json`
   - exit 0; JSON `{ ok: true }`
7. Round-trip: add → list contains → enable → disable → remove → list excludes
8. `mcp registry search <query> --json`
   - exit 0; JSON array of registry entries
9. **Error cases:**
   - `mcp add` missing `--url` → exit non-zero, usage
   - `mcp get <non-existent>` → exit non-zero; `{ error }`
   - `mcp remove <non-existent>` → exit non-zero; `{ error }`

## Assertions

- [ ] `mcp list --json` array: `{ id, name, url, enabled, status }`
- [ ] `mcp add --json` returns `{ ok, id, name, url }`
- [ ] enable/disable toggle `enabled` correctly
- [ ] Round-trip: add → enable → disable → remove → excluded from list
- [ ] `mcp registry search --json` returns array
- [ ] Missing `--url` exits non-zero
- [ ] Non-existent id exits non-zero with `{ error }`
