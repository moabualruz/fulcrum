---
Status: completed
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/03-backup-restore-trpc.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, C1, D5]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B7 backup/restore)
Docs: https://github.com/graphile/worker, https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingRESTError.html
---

# GATED: scheduled-backups — cron graphile-worker job, S3/R2/B2/GCS/Azure remote upload adapters

## What to build

Behind `FULCRUM_FEATURES=scheduled-backups`. graphile-worker recurring task `backups:scheduled` (cron expression stored through `TenantSettingRepository.upsertValue('backup.cron', '0 2 * * *')` — daily at 2am default). Each run: calls `src/backup/runner.ts` → generates local `.tar.gz` → uploads to remote storage via per-provider adapter. Providers: S3 (`@aws-sdk/client-s3`), Cloudflare R2 (S3-compatible, same SDK), Backblaze B2 (S3-compatible), GCS (`@google-cloud/storage`), Azure Blob (`@azure/storage-blob`). DSN string format: `s3://bucket/prefix`, `r2://bucket/prefix`, `b2://bucket/prefix`, `gcs://bucket/prefix`, `azure://container/prefix`. Retry: 3× exponential on failure; on final failure → `Event` kind `backup_upload_failed` + doctor `platform.remote_backup: fail`. After successful upload → local backup pruned if >7 copies. Web: `/settings/backup → Schedule tab` (Pillar 16 issue 18).

## Acceptance criteria

- [ ] Flag OFF: no graphile-worker `backups:scheduled` task registered; `/settings/backup` shows no Schedule tab.
- [ ] Flag ON: task registered with correct cron expression; manual trigger via `fulcrum backup --remote` → upload to mocked S3 adapter; success → `Event` kind `backup_upload_succeeded`.
- [ ] S3 adapter: `PutObjectCommand` called with correct bucket/key/body; mocked 200 → success.
- [ ] 5xx response → retry 3× exponential; final failure → `Event` + doctor fail.
- [ ] R2/B2: same S3-compatible adapter, DSN parsing differs only in endpoint URL.
- [ ] GCS adapter: `file.save()` called; mocked success.
- [ ] Local pruning: >7 backup files in `~/.fulcrum/state/backups/` → oldest pruned after successful remote upload.
- [ ] Web: cron builder saves to `TenantSetting`; "Remote storage DSN" field saves to `TenantSetting` key `backup.remote_dsn`.
- [ ] Vitest: S3 adapter with mocked `@aws-sdk/client-s3`; GCS with mocked SDK; retry behavior.

## Blocked by

- Issue 03 (backup/restore tRPC) — `src/backup/runner.ts` must produce local archive.
