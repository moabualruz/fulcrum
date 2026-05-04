---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/product.test.ts
Framework: bun-test
Blocked-by: [P1-01, P1-05]
---

# CLI: fulcrum product (tasks, docs, projects, sprints)

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — product commands`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — product commands`

## What to test

`src/cli/product.ts` — product domain subcommands (tasks, docs, projects, sprints). Existing `src/cli/product.test.ts` exists; extend to cover every verb's `--json` output shape, error cases, and DB round-trips.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Use real PGlite via in-process tRPC (integration-level)

## Tasks subcommands

1. `tasks create --title "Fix bug" --status todo --json`
   - exit 0; JSON matches `TaskSchema`; contains `{ id, title, status }`
2. `tasks list --json`
   - exit 0; JSON array; created task in list
3. `tasks get <id> --json`
   - exit 0; full task object with all fields
4. `tasks update <id> --status in-progress --json`
   - exit 0; JSON shows updated status
5. `tasks delete <id> --json`
   - exit 0; `{ ok: true }`
6. Round-trip: create → list contains → get matches → update → list shows new status → delete → list excludes
7. **Error cases:**
   - `tasks create` missing `--title` → exit non-zero
   - `tasks get <non-existent>` → exit non-zero; `{ error }`
   - `tasks update <non-existent>` → exit non-zero

## Docs subcommands

1. `docs create --title "ADR-001" --type adr --json` → `{ id, title, docType }`
2. `docs list --json` → array contains new doc
3. `docs get <id> --json` → full doc with `body` field
4. Round-trip: create → get → update body → get shows new body

## Projects subcommands

1. `projects create --name "Alpha" --json` → `{ id, name, slug }`
2. `projects list --json` → array with new project
3. Round-trip: create → list → delete → list excludes

## Assertions

- [ ] `tasks create --json` returns TaskSchema-compliant object
- [ ] All task verbs (list/get/update/delete) `--json` shapes correct
- [ ] Task round-trip: create → update → delete → excluded
- [ ] `docs create --json` returns `{ id, title, docType }`
- [ ] `projects create --json` returns `{ id, name, slug }`
- [ ] Missing required args exit non-zero
- [ ] Non-existent IDs exit non-zero with `{ error }`
