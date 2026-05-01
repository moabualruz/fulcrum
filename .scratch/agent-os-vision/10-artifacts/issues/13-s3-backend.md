---
Status: ready-for-agent
Triage: AFK
Pillar: artifacts
Blocked-by: [02-storage-backend.md, 06-trpc-procedures.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [C1, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# Gated: S3Backend (external-storage-s3) + AzureBackend + GcsBackend + flag routing in StorageBackend factory

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Gated features: external-storage-s3/azure/gcs; issues 10-15, 10-16, 10-17)

## What to build
Implement three cloud storage backends behind their respective feature flags, plus the `createStorageBackend(flags)` factory update. `S3Backend` using `@aws-sdk/client-s3` v3: `put/get/delete/exists` + presigned download URL generation; env vars `FULCRUM_S3_ENDPOINT`, `FULCRUM_S3_BUCKET`, `FULCRUM_S3_ACCESS_KEY`, `FULCRUM_S3_SECRET_KEY`. `AzureBackend` using `@azure/storage-blob` v12: `FULCRUM_AZURE_CONN_STRING`, `FULCRUM_AZURE_CONTAINER`. `GcsBackend` using `@google-cloud/storage` v7: `FULCRUM_GCS_BUCKET`, `FULCRUM_GCS_KEY_FILE`. All three implement the same `StorageBackend` interface. `artifacts.path` stores relative path (same convention); local-fs copy skipped when cloud flag ON. Download: redirect to presigned URL.

## Acceptance criteria
- [ ] Schema migration: no new columns; `artifacts.path` stores S3 key (same relative path convention).
- [ ] tRPC procedure / module: `createStorageBackend()` factory returns correct backend per enabled flag; `artifacts.upload` / harvest use factory.
- [ ] Web surface: `/artifacts/<id>/download` redirects to presigned URL when S3 flag ON; local-fs download otherwise. Flag off → local-fs only (no regression).
- [ ] CLI command: `fulcrum artifacts download <id> --out /tmp/x` works with S3 backend (streams presigned URL); `--json` includes `storageBackend: 's3'` in metadata.
- [ ] TUI screen: `d` download uses presigned URL stream when S3 flag ON.
- [ ] Tests: S3 backend tested against MinIO (local Docker or `@aws-sdk` mock); flag OFF → local-fs only, no S3 calls; ON → file in MinIO bucket, not on local disk; download → presigned redirect; Azure + GCS backend unit tests with SDK mocks; retry 3× on network error; RED→GREEN.

## Blocked by
- `02-storage-backend.md` — `StorageBackend` interface.
- `06-trpc-procedures.md` — procedures use factory.

## Notes / Tech-stack hints
- All three flags: `FULCRUM_FEATURES=external-storage-s3`, `external-storage-azure`, `external-storage-gcs` per D5 naming.
- Failure gate: S3 SDK too heavy → `xh` presigned upload as fallback; Azure SDK too large → raw `xh` with SAS URL.
- Only one cloud backend active at a time (factory returns first enabled); document priority order.
- MinIO compatible with S3 SDK via `endpoint` override — use in integration tests.
