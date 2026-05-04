---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/agent.test.ts
Framework: bun-test
Blocked-by: [P1-01, P1-05]
---

# CLI: fulcrum agent Lifecycle

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — agent lifecycle`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — agent lifecycle`

## What to test

Integration test for `fulcrum agent` command — register, list, get, remove lifecycle. Not currently integration-tested.

## Setup

```ts
// Run via in-process handler with mock caller (not Bun.spawn)
import { run as agentRun } from "../../src/cli/agent.ts";

const mockCaller = {
  agents: {
    list: mock(() => Promise.resolve([{ id: "a1", label: "test-agent", capabilities: ["code"] }])),
    get: mock(() => Promise.resolve({ id: "a1", label: "test-agent", capabilities: ["code"] })),
    register: mock(() => Promise.resolve({ id: "a1", label: "test-agent" })),
    remove: mock(() => Promise.resolve({ ok: true })),
  },
};
```

## Steps

1. `agent register --name test-agent --profile ./fixtures/agent.yaml --json`
   - exit code 0
   - `--json` output is valid JSON containing `{ id, label }`
   - JSON shape matches `AgentSchema` from `src/trpc/schemas/agents.ts`
2. `agent list --json`
   - exit code 0
   - output is JSON array; test-agent present
   - each item has `id`, `label`, `capabilities` fields
3. `agent get test-agent --json`
   - exit code 0
   - output contains `capabilities` array
4. `agent remove test-agent`
   - exit code 0
   - human output confirms removal
5. `agent list --json` after remove
   - test-agent not in array
6. **Error cases:**
   - `agent get non-existent --json` → exit non-zero; JSON `{ error: string }` in output
   - `agent register` missing `--name` → exit non-zero; usage hint in stderr
   - `agent remove non-existent` → exit non-zero

## Assertions

- [ ] `agent register --json` exits 0, returns `{ id, label }`
- [ ] `agent list --json` returns array; each item has id/label/capabilities
- [ ] `agent get --json` returns profile with capabilities
- [ ] `agent remove` exits 0
- [ ] `agent get <missing>` exits non-zero with JSON error
- [ ] `agent register` with missing required arg exits non-zero
- [ ] Round-trip: register → list contains → get matches → remove → list excludes
