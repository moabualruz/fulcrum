# Backup

The backup application area produces local `.tar.gz` archives of the product database and supporting state, uploads them to remote object storage, and is driven both by the `fulcrum backup` CLI and a scheduled graphile-worker task.

## Language

**BackupArchive**:
A versioned `fulcrum.backup.v1` payload bundling a base64 database `dump`, per-component checksums, and `entityCounts`, serialized as a gzip `.tar.gz` file under the backups state dir.
_Avoid_: snapshot, dump file, tarball, export

**BackupArchiveComponent**:
A sub-section of a **BackupArchive** (`database`, `artifacts`, `config`, `localState`) carrying `included`, `itemCount`, and `checksumSha256`.
_Avoid_: archive part, segment, slice

**CliBackupTables**:
The ordered set of product tables (`orgs`, `users`, `projects`, `repos`, `documents`, `tasks`, `memories`, `agent_runs`, `artifacts`, `edges`, `events`) read for a CLI backup and replayed in FK-safe order during restore.
_Avoid_: table dump, backup set, schema list

**RemoteAdapter**:
A provider-specific uploader for one of `s3 | r2 | b2 | gcs | azure` selected by parsed DSN scheme; receives an archive path and a key.
_Avoid_: storage driver, backend, sink

**BackupDSN**:
A `provider://bucket/prefix` URL identifying the remote target; must never carry inline credentials — secrets resolve through a `credentialRef` against the **Credential** store.
_Avoid_: connection string, bucket url, endpoint

**UploadResult**:
The outcome of an `uploadBackup` call carrying `success`, `provider`, `key`, `attempts`, and optional `error` / `credentialRef`, produced after up to three exponential retries.
_Avoid_: upload status, response, transfer record

**BackupEvent**:
A typed payload (`backup_upload_succeeded | backup_upload_failed`) derived from an **UploadResult** and handed to the injected emitter so the platform records an audit **Event**.
_Avoid_: notification, hook payload, signal

**ScheduledBackupTask**:
The graphile-worker recurring task `backups:scheduled` (default cron `0 2 * * *`) gated by feature flag `scheduled-backups`, reading cron + DSN from **TenantSetting** keys `backup.cron` and `backup.remote_dsn`.
_Avoid_: cron job, nightly job, worker

**LocalBackupPrune**:
The retention step that keeps only the `MAX_LOCAL_COPIES` (7) most recent `.tar.gz` files in the backups state dir, run only after a successful remote upload.
_Avoid_: cleanup, rotation, gc

## Relationships

- A **ScheduledBackupTask** invocation produces one **BackupArchive**, then one **UploadResult**, then one **BackupEvent**.
- A **BackupArchive** has exactly four **BackupArchiveComponents** (`database`, `artifacts`, `config`, `localState`).
- A **RemoteAdapter** is selected per **BackupDSN** `provider`; S3/R2/B2 share one adapter via S3-compatible endpoints.
- A **BackupDSN** references a **Credential** (from platform-core) by `credentialRef`; raw secrets never travel in the DSN string.
- A successful **UploadResult** triggers **LocalBackupPrune**; a failed one triggers an `onDoctorFail` callback against check `platform.remote_backup`.
- A **BackupEvent** is the application-layer shape that the platform persists as an **Event** (audit) — the parent platform-core context owns that audit entity.

## Example dialogue

> **Dev:** "Where does the DSN's secret access key live?"
> **Domain expert:** "Never in the **BackupDSN**. The DSN holds only `provider://bucket/prefix`; the secret resolves through `credentialRef` against the **Credential** store, and adapters receive the resolved client via `RemoteAdapterOptions`."
> **Dev:** "And after a successful upload, do we delete the local `.tar.gz`?"
> **Domain expert:** "We run **LocalBackupPrune**, which keeps the 7 most recent archives. We never prune on failure — the local copy is the fallback."

## Flagged ambiguities

- "backup" was used to mean both the on-disk `.tar.gz` artifact and the scheduled task run — resolved: the artifact is a **BackupArchive**; the run is a **ScheduledBackupTask** invocation.
- "event" overlapped the local **BackupEvent** value object with the platform-core **Event** audit entity — resolved: **BackupEvent** is the in-process payload produced by `makeBackupEvent`; persistence as an **Event** is the platform-core concern.
