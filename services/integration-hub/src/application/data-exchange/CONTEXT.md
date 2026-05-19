# Data Exchange

Sub-area owning single-table CSV import/export of `FulcrumTask` rows and the column-level redaction filter applied to outbound data before write.

## Language

**TaskCsvRow**:
A flat row shape (id, org_id, project_id, parent_id, title, description, status, priority, created_at, updated_at) serialized as one CSV line per task.
_Avoid_: Task export record, task DTO.

**ColumnMap**:
A user-supplied `{ "CSV Header": "fulcrum_field" }` table that maps incoming CSV headers to Fulcrum field names during import.
_Avoid_: FieldMap (reserved for Importer source mappings), header map.

**SkippedRecord**:
A `{record, reason}` entry recording one data row rejected during CSV import (e.g. missing required `title`), indexed by 1-based data-row number.
_Avoid_: Error row, rejected row.

**ImportResult**:
The outcome of an `importCsv` call: `{total, written, skipped, skipped_records, records}`; `written` is 0 in dry-run mode.
_Avoid_: SyncResult (reserved for Connector/Importer runs), import report.

**ExportResult**:
The outcome of an `exportTasksToCsv` call: `{path, entity_count}` describing the output file and row count written.
_Avoid_: Export report, dump summary.

**SensitiveExportColumn**:
A column whose normalized name (lowercased, non-alphanumerics stripped) matches the closed set `{apitoken, apikey, encryptedvalue, password, secret, token}` and is filtered out by `redactExportRow`.
_Avoid_: Secret column, redacted field.

**FeatureFlag**:
A name read from the `FULCRUM_FEATURES` env var (comma-separated) gating each entry point — `export-csv` for export, `import-csv` for import.
_Avoid_: Toggle, switch.

## Relationships

- An **ImportResult** contains many **SkippedRecords** (one per rejected data row).
- A **ColumnMap** key must match a header in the input CSV; values become keys on each emitted record.
- `redactExportRow` filters every column matching **SensitiveExportColumn** from a row before serialization.
- Each entry point (`exportTasksToCsv`, `importCsv`) is gated by exactly one **FeatureFlag**.

## Example dialogue

> **Dev:** "Can I reuse the **ColumnMap** shape for the Jira **Importer**?"
> **Domain expert:** "No — Importers use **FieldMap** (`jira.fieldmap.ts`) with status-vocab translation. **ColumnMap** is the bare CSV-header-to-field rename used only by `importCsv`. Keep them separate; they live in different sub-areas."
> **Dev:** "If a CSV column is named `API_Token`, does `redactExportRow` catch it on export?"
> **Domain expert:** "Yes — `normalizeColumnName` lowercases and strips non-alphanumerics, so `API_Token` → `apitoken`, which is in the **SensitiveExportColumn** set."

## Flagged ambiguities

- **ColumnMap vs FieldMap** — both translate external headers into Fulcrum field names. Resolved: **ColumnMap** is the user-supplied per-import dict consumed by `importCsv`; **FieldMap** is the per-source TypeScript module used by Importers. Do not collapse.
- **ImportResult vs SyncResult** — both summarize a run. Resolved: **ImportResult** is the CSV-import outcome (`total/written/skipped`); **SyncResult** is the Connector/Importer outcome (`imported/updated/errors` or `pulled/pushed/skipped/errors`). Not interchangeable.
- **SensitiveExportColumn vs ExportRedaction** — parent service uses **ExportRedaction** for the JSON `ImportManifest` column filter. This sub-area's `redactExportRow` applies the same idea to single-table CSV rows; same closed set, narrower scope. Do not promote the term upward.
