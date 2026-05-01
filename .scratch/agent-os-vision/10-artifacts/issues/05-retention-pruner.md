---
Status: ready-for-agent
Triage: AFK
Pillar: artifacts
Blocked-by: [01-schema-migration.md, 02-storage-backend.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q35]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# Retention pruner: artifact.prune cron, soft-delete, hard-delete, dry-run, doctor integration

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Always-on: Retention + pruner; issues 10-06, 10-20)

## What to build
Register graphile-worker cron task `artifact.prune` (daily at 02:00) per Q35 retention policy: selects `artifacts WHERE retention_until < now() AND archived = false`; deletes files from disk via `StorageBackend.delete`; sets `archived = true` (soft-delete); after 7-day grace period, second pass hard-deletes rows. Implements `--dry-run` mode that logs candidates to `~/.fulcrum/logs/prune-<date>.log` without mutating. Manual confirm required for any sweep >100 MB or >100 files. Doctor integration: reports total artifact count, total disk usage bytes, count past `retention_until`, count archived.

## Acceptance criteria
- [ ] Schema migration: reads `artifacts.retention_until` and `artifacts.archived` from `0010_artifacts`.
- [ ] tRPC procedure / module: `artifacts.prune` tRPC procedure (manual trigger); `src/artifacts/pruner.ts` core logic; `registerPrunerCron(worker)` wires cron schedule.
- [ ] Web surface: `/projects/<id>/artifacts` shows disk usage stat; UI for manual prune trigger with dry-run checkbox.
- [ ] CLI command: `fulcrum artifacts prune --dry-run --json` prints candidate list; `fulcrum artifacts prune --project-id <id>` scopes prune; no delete without `--confirm` when >100 MB/100 files.
- [ ] TUI screen: Artifacts pane shows "(N past retention)" count; `P` triggers prune dry-run and shows candidate list in overlay.
- [ ] Tests: artifact with `artifact_retention_days=1`; prune soft-archives artifact + deletes file from disk; dry-run logs candidates without deleting; hard-delete after 7 days; >100 files → requires confirm; doctor reports correct counts; RED→GREEN.

## Blocked by
- `01-schema-migration.md` — `retention_until`, `archived` columns.
- `02-storage-backend.md` — `StorageBackend.delete`.
- Pillar 1 (Foundation) — graphile-worker cron registration pattern.

## Notes / Tech-stack hints
- Q35: soft-delete first (`archived=true`, file deleted from disk); hard-delete row after 7-day grace (`archived=true AND archived_at < now() - interval '7 days'`).
- Add `archived_at timestamptz` column in this slice (not in initial migration if missing).
- Pruner always dry-runs to log file first; cron run logs without writing to log file if nothing to prune.
- `--confirm` prompt in CLI; TUI confirmation modal before destructive prune.
- Audit-log every prune action: `events` row `verb='artifact.pruned'` with payload `{ count, bytes_freed }`.
