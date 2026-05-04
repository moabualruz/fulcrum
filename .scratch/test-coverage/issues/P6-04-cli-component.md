---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/component.test.ts
Framework: bun-test
Blocked-by: []
---

# CLI: fulcrum component — Scaffold Generation

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — component scaffold`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — component scaffold`

## What to test

`src/cli/component.ts` — scaffold generation command. No test currently exists.

## Setup

```ts
import { run as componentRun, parseComponentArgs } from "../../src/cli/component.ts";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
```

## Steps

1. `component --type screen --name my-screen --output <tmpdir>`
   - exit 0
   - at least one `.ts` file generated in tmpdir
   - generated file contains "my-screen"
   - generated TypeScript parseable without syntax error
2. `component --type router --name my-router --output <tmpdir>`
   - exit 0; router scaffold generated
3. `component --json --type screen --name test-screen --output <tmpdir>`
   - exit 0; JSON: `{ ok: true, files: string[] }`
4. **Error cases:**
   - Missing `--type` → exit non-zero, usage in stderr
   - Missing `--name` → exit non-zero
   - Invalid `--type unknown-type` → exit non-zero, lists valid types
   - `--output` is a file (not dir) → exit non-zero

## Assertions

- [ ] Screen scaffold generates `.ts` file containing component name
- [ ] Router scaffold generates `.ts` file
- [ ] `--json` output contains `files` array
- [ ] Missing `--type` exits non-zero
- [ ] Missing `--name` exits non-zero
- [ ] Invalid type exits non-zero with valid types listed
