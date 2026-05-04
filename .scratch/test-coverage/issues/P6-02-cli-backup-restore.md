---
Status: ready-for-agent
Phase: P6
Priority: medium
Test-file: tests/cli/backup-restore.test.ts
Framework: bun-test
Blocked-by: [P1-01, P1-05]
---

# CLI: fulcrum backup/restore Round-Trip

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(cli): RED — backup restore round-trip`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(cli): GREEN — backup restore round-trip`

## What to test

Integration test for interactive backup+restore round-trip. Not currently tested end-to-end.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Seed: 1 project, 3 tasks, 2 docs via PGlite

## Steps

1. Seed: create 1 project, 3 tasks, 2 docs via in-process tRPC caller
2. `backup --output <tmpdir>/backup.tar.gz --non-interactive --json`
   - exit 0
   - `--json` output: `{ ok: true, path, sizeBytes: number, entityCounts: { tasks, docs, projects } }`
   - verify backup file exists and `sizeBytes > 0`
   - verify `entityCounts.tasks === 3`, `entityCounts.docs === 2`
3. Reset `FULCRUM_HOME` to fresh tmpdir (no data)
4. `restore --input <backup-path> --non-interactive --json`
   - exit 0
   - `--json` output: `{ ok: true, restored: { tasks, docs, projects } }`
5. `tasks list --json` → array length 3; task titles match seeded titles
6. `docs list --json` → array length 2
7. **Error cases:**
   - `backup` with non-writable output path → exit non-zero, error in stderr
   - `restore` with non-existent input file → exit non-zero, error message
   - `restore` with corrupted archive → exit non-zero

## Assertions

- [ ] Backup `--json` output contains `entityCounts` with correct counts
- [ ] Backup file is non-empty tar.gz
- [ ] Restore `--json` reports correct restored counts
- [ ] Post-restore task titles match pre-backup titles
- [ ] Post-restore doc count matches
- [ ] Backup with bad output path exits non-zero
- [ ] Restore with missing file exits non-zero
- [ ] Restore with corrupted archive exits non-zero
