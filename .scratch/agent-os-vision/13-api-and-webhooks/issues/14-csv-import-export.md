---
Status: implemented
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/09-connector-framework-interface.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q-flag-granularity, C1, C5, Q-cross-cut]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: []
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

CSV import (`import-csv`) and export (`export-csv`) gated by individual flags. Import: `connectors.importCsv(file, entity, projectId, columnMap)` tRPC procedure; column-mapping validation (required columns: title for tasks, title+doc_type for docs); idempotent by `external_id` column if present; streaming parse for >10k rows; returns `{ created, skipped, errors[] }`. Export: `connectors.exportCsv(entity, projectId)` → streaming CSV response; correct `Content-Disposition` header; handles >1k rows without buffering full result set.

- **Web**: `/settings/connectors` import modal with column-mapping table; export download button per entity.
- **CLI**: `fulcrum import csv --file tasks.csv --entity tasks --project <id>`, `fulcrum export csv --entity tasks --output out.csv --json`.
- **TUI**: Settings → Connectors → CSV section: file path prompt for import, export path prompt.

## Acceptance criteria

- [x] Valid CSV with 100 tasks → all imported; returned `created=100, skipped=0, errors=[]`.
- [x] CSV with duplicate `external_id` → idempotent (first import creates, second import skips; `skipped=N`).
- [x] CSV with missing required header → `{ error: { code: 'VALIDATION_ERROR', columns: ['title'] } }` (422 on REST).
- [x] Export 1k tasks → streaming response; `Content-Disposition` header present; CSV headers correct.
- [x] `import-csv` flag OFF → `FeatureDisabledError`; ON → import succeeds.
- [ ] Web import modal, CLI `fulcrum import csv`, TUI import flow all import into same project visible from all surfaces.

## Blocked by

- 13/issues/09-connector-framework-interface.md

## Notes

P13.33–P13.34 maps to this slice. Column-mapping wizard for web uses a table with dropdown per CSV header.
