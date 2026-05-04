---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/connectors.test.ts
Framework: bun-test
Blocked-by: [P1-01, P1-05]
---

# CLI: fulcrum connectors

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — connectors`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — connectors`

## What to test

`src/cli/connectors.ts` — connector management commands. Existing `tests/cli/connectors.test.ts` exists; extend to cover `--json` shape and error cases.

## Setup

```ts
import { run as connectorsRun } from "../../src/cli/connectors.ts";

const mockCaller = {
  connectors: {
    list: mock(() => Promise.resolve([
      { id: "c1", kind: "linear", enabled: true, lastSyncAt: "2026-01-01" },
    ])),
    add: mock(() => Promise.resolve({ id: "c2", kind: "github", enabled: true })),
    remove: mock(() => Promise.resolve({ ok: true })),
    sync: mock(() => Promise.resolve({ ok: true, recordsSynced: 42 })),
    test: mock(() => Promise.resolve({ ok: true, latencyMs: 120 })),
  },
};
```

## Steps

1. `connectors list --json`
   - exit 0
   - JSON array; each item: `{ id, kind, enabled, lastSyncAt }`
2. `connectors add --type linear --url https://linear.app --token tok --json`
   - exit 0; JSON `{ id, kind, enabled }`
3. `connectors test c1 --json`
   - exit 0; JSON `{ ok: true, latencyMs: number }`
4. `connectors sync c1 --json`
   - exit 0; JSON `{ ok: true, recordsSynced: number }`
5. `connectors remove c1 --json`
   - exit 0; JSON `{ ok: true }`
6. Round-trip: add → list contains → sync → remove → list excludes
7. **Error cases:**
   - `connectors test non-existent --json` → exit non-zero; `{ error: string }`
   - `connectors add` missing `--type` → exit non-zero
   - `connectors sync` on disabled connector → exit non-zero or `{ ok: false, error }`

## Assertions

- [ ] `connectors list --json` array shape: `{ id, kind, enabled, lastSyncAt }`
- [ ] `connectors add --json` returns `{ id, kind, enabled }`
- [ ] `connectors test --json` returns `{ ok, latencyMs }`
- [ ] `connectors sync --json` returns `{ ok, recordsSynced }`
- [ ] `connectors remove --json` returns `{ ok: true }`
- [ ] Round-trip: add → sync → remove verifiable via list
- [ ] Missing `--type` on add exits non-zero
