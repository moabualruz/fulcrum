---
Status: completed
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/09-json-import-export-trpc.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, C1, D5]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B8 import/export)
Docs: https://bun.sh/docs
---

# GATED: import-csv + export-csv — column mapper, import pipeline, CLI + Web surfaces

## What to build

Two gated features sharing the CSV infrastructure. `export-csv`: behind `FULCRUM_FEATURES=export-csv`. `src/data/csv-export.ts`: tasks/docs/memories exported as CSV; column headers match entity field names; all entities; streaming write for large exports. CLI: `fulcrum export --format csv --entity tasks [--output <path>]`. Web: `/settings/data` Export section shows "CSV" option when flag ON. `import-csv`: behind `FULCRUM_FEATURES=import-csv`. `src/data/csv-import.ts`: reads CSV; infers schema from headers; user-defined `--column-map` JSON `{"csv_col": "task_field"}` maps CSV headers to Fulcrum fields; validates per-record Zod schema; creates tasks via `tasks.create` tRPC. CLI: `fulcrum import --input <path> --format csv --column-map <json> [--dry-run]`. Web: `/settings/data` → Import tab → "CSV" sub-tab shows file upload + column mapper UI (drag-drop CSV column onto Fulcrum field).

## Acceptance criteria

- [ ] `export-csv` OFF: `fulcrum export --format csv` → error "Feature export-csv not enabled"; `/settings/data` CSV option hidden.
- [ ] `export-csv` ON: `fulcrum export --format csv --entity tasks --output /tmp/tasks.csv` → valid CSV; headers match task field names; all task entities present; `--json` returns `{path, entity_count}`.
- [ ] `import-csv` OFF: `fulcrum import --format csv` → error; CSV sub-tab hidden.
- [ ] `import-csv` ON: `--column-map '{"Title":"title","Status":"status"}'` → entities imported; `--dry-run` shows count without write.
- [ ] Column mapper: invalid mapping (CSV column not in file) → error "Column 'X' not found in CSV".
- [ ] Web column mapper: drag CSV column onto Fulcrum field → mapping saved; preview shows first 3 rows mapped; submit → import.
- [ ] Skipped records: records with missing required field → reported in `{skipped: N, skipped_records: [{record: N, reason: "..."}]}`.
- [ ] Vitest: export 100 tasks → CSV round-trip → import → same 100 tasks.

## Blocked by

- Issue 09 (JSON import/export tRPC) — base import/export pipeline pattern established.
