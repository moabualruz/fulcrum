---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/inference.test.ts
Framework: bun-test
Blocked-by: [P5-01]
---

# CLI: fulcrum inference

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — inference`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — inference`

## What to test

`src/cli/inference.ts` — `fulcrum inference` subcommands. Existing `src/cli/inference.test.ts` unit tests exist; extend to cover `--json` output shape, `models list`, and error cases.

## Setup

```ts
import { run as inferenceRun } from "../../src/cli/inference.ts";

const mockCaller = {
  inference: {
    status: mock(() => Promise.resolve({ status: "running", pid: 1234, message: null })),
    start: mock(() => Promise.resolve({ status: "running", pid: 5678, message: null })),
    stop: mock(() => Promise.resolve({ status: "stopped", pid: null, message: null })),
    models: {
      list: mock(() => Promise.resolve([
        { id: "llama3", kind: "local", status: "loaded", sizeBytes: 4_000_000_000, default: true },
      ])),
    },
  },
};
```

## Steps

1. `inference status --json`
   - exit 0; JSON: `{ status: "running"|"stopped"|"error", pid: number|null, message: string|null }`
2. `inference start --json`
   - exit 0; JSON contains `{ status, pid }`
3. `inference stop --json`
   - exit 0; JSON contains `{ status: "stopped" }`
4. `inference models list --json`
   - exit 0; JSON array: `[{ id, kind, status, sizeBytes, default }]`
5. `inference status` (human output) → stdout contains "running" or "stopped"
6. **Error cases:**
   - `inference start` when sidecar binary missing → exit non-zero; `{ error: string }`
   - `inference stop` when already stopped → exit 0 (idempotent) — document actual behavior
   - `inference models list` with empty registry → JSON `[]`, exit 0

## Assertions

- [ ] `status --json` shape: `{ status, pid, message }`
- [ ] `start --json` returns running status with pid
- [ ] `stop --json` returns stopped status
- [ ] `models list --json` array: `{ id, kind, status, sizeBytes, default }`
- [ ] Human output contains status string
- [ ] Missing sidecar binary exits non-zero with error
- [ ] Empty model registry returns `[]`, exits 0
