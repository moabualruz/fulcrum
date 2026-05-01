---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, B7, C4]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B7 backup/restore)
Docs: https://pglite.dev/docs
---

# Local backup + restore — runner.ts, tRPC procedures, CLI integration

## What to build

`src/backup/runner.ts`: SQL dump (row-by-row INSERT per table, FK-ordered), artifact tarball (`~/.fulcrum/state/artifacts/**`), JSONL error file collection, `fulcrum-backup-manifest.json` (schema version, Fulcrum version, timestamp, table row counts). Encryption: `--encrypt` flag → `nacl.secretbox` re-encrypts tarball with one-time key; key stored in system keyring + written to `<backup-name>.key` file alongside archive. `fulcrum restore --input <path> [--key <keyfile>] [--dry-run]`: reads manifest, checks schema version compat, detects UUID collisions, applies with `ON CONFLICT DO UPDATE`. `backup.create` / `backup.list` / `restore.preflight(path)` / `restore.run(importId, options)` tRPC procedures. CLI: `fulcrum backup [--output] [--encrypt] [--no-artifacts]` / `fulcrum restore --input [--dry-run]`.

Cuts through: `backup.create` → SQL dump → tar → manifest → file written to `~/.fulcrum/state/backups/` → `restore.preflight` → collision list → `restore.run` → rows re-inserted.

## Acceptance criteria

- [ ] `fulcrum backup --output /tmp/test.tar.gz`: all tables included; manifest has correct row counts; artifact files included (unless `--no-artifacts`); symlinks not followed.
- [ ] `--encrypt`: `.enc` file produced; `fulcrum restore --key <file>` decrypts and restores; wrong key → error.
- [ ] `restore.preflight`: returns collision list for matching UUIDs; dry-run reports entity counts without writing.
- [ ] `restore.run --on-conflict update`: all rows inserted/updated; task count matches pre-backup count.
- [ ] `restore.run --on-conflict error`: halts on first collision; partial writes rolled back.
- [ ] Schema version mismatch: warns but proceeds (not fatal); doctor reports `platform.backup_last_run`.
- [ ] `--json` flag: `fulcrum backup --json` returns `{manifest: {...}, path: "..."}`.
- [ ] Vitest: backup/restore round-trip on in-memory PGlite; 10k task rows correct.

## Blocked by

- Issue 02 (secrets + vault) — encryption uses `nacl.secretbox` from vault module.
