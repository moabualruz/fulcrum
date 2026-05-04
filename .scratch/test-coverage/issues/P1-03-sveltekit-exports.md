---
Status: ready-for-agent
Phase: P1
Priority: critical
Test-file: tests/infrastructure/sveltekit-exports.test.ts
Framework: bun-test
Blocked-by: []
---

# SvelteKit Export Validation

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Scans all `+page.server.ts` files for exports not in the SvelteKit allowed set. Catches the bug where 12 routes exported helper functions/constants, causing SvelteKit to reject them with 500 errors.

## Setup

- Static file analysis only — no server needed
- Glob `src/web/src/routes/**/+page.server.ts`

## Steps

1. Glob all `+page.server.ts` files under `src/web/src/routes/`
2. For each file, parse exports using regex or AST
3. Valid exports: `load`, `actions`, `prerender`, `csr`, `ssr`, `trailingSlash`, `config`, `entries`, `_`-prefixed names
4. Collect any export not in that set as a violation
5. Report violations with file path and export name

## Assertions

- [ ] Zero invalid exports across all `+page.server.ts` files
- [ ] Every file has at least one valid export (`load` or `actions`)
