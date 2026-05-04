---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/export-import.test.ts
Framework: bun-test
Blocked-by: [P1-01, P1-05]
---

# CLI: fulcrum export/import Round-Trip

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — export import round-trip`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — export import round-trip`

## What to test

`src/cli/export.ts` + `src/cli/import.ts` — end-to-end round-trip. No round-trip test currently exists.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Seed: 1 project, 5 tasks with custom fields, 2 docs, 1 sprint via in-process tRPC

## Steps

1. `export --format json --output <tmpdir>/export.json --json`
   - exit 0
   - `--json` meta output: `{ ok: true, path, entityCounts: { tasks: 5, docs: 2, projects: 1, sprints: 1 } }`
   - export file is valid JSON with `tasks`, `docs`, `projects` arrays
2. Delete all tasks via in-process tRPC
3. `import --format json --input <export-path> --json`
   - exit 0
   - `--json` output: `{ ok: true, imported: { tasks: 5, docs: 2, projects: 1 } }`
4. `tasks list --json` → 5 tasks; titles match seeded titles
5. `docs list --json` → 2 docs; titles match
6. Custom field values preserved through round-trip
7. **Error cases:**
   - `export` with unwritable path → exit non-zero
   - `import` with missing file → exit non-zero; `{ error: string }`
   - `import` with invalid JSON → exit non-zero
   - `import --format csv` (unsupported) → exit non-zero, lists supported formats

## Assertions

- [ ] Export `--json` contains `entityCounts` matching seeded counts
- [ ] Export file contains `tasks`, `docs`, `projects` arrays
- [ ] Import `--json` reports correct imported counts
- [ ] Task titles preserved through round-trip
- [ ] Custom field values preserved
- [ ] Unwritable export path exits non-zero
- [ ] Missing import file exits non-zero with `{ error }`
- [ ] Invalid JSON import exits non-zero
