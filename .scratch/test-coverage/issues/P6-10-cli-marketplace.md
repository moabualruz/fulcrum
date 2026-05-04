---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/marketplace.test.ts
Framework: bun-test
Blocked-by: []
---

# CLI: fulcrum marketplace

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — marketplace`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — marketplace`

## What to test

`src/cli/marketplace.ts`. Existing `src/cli/marketplace.test.ts` exists; extend to cover `--json` shape and error cases.

## Setup

```ts
import { run as marketplaceRun } from "../../src/cli/marketplace.ts";
// Mock registry via in-process mock caller or Bun.serve
```

## Steps

1. `marketplace search biome --json`
   - exit 0; JSON array: `[{ name, version, description, downloads }]`
2. `marketplace search biome` (human output) → stdout contains "biome" and version string
3. `marketplace info @fulcrum/biome --json`
   - exit 0; JSON: `{ name, version, description, readme, dependencies }`
4. `marketplace install @fulcrum/biome --json`
   - Delegates to install — exit 0; JSON `{ ok, installed }`
5. **Error cases:**
   - `marketplace info @fulcrum/non-existent --json` → exit non-zero; `{ error: string }`
   - `marketplace install @fulcrum/non-existent --json` → exit non-zero; `{ error: string }`
   - Unreachable registry → exit non-zero with network error message

## Assertions

- [ ] `search --json` array shape: `{ name, version, description, downloads }`
- [ ] `info --json` includes `readme` field
- [ ] `install` delegates correctly, exits 0
- [ ] Non-existent package info exits non-zero with `{ error }`
- [ ] Human search output contains package name and version
- [ ] Unreachable registry exits non-zero
