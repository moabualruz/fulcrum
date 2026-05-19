# Import / Export

Sub-area that produces and consumes the `fulcrum.json-export.v1` **ImportManifest** for full-workspace JSON portability, applying redaction on export and a `skip|update|error` collision policy on import.

## Language

**ImportManifest**:
A `fulcrum.json-export.v1` document with a `manifest` header and one table-keyed array of row records per public table.
_Avoid_: Dump, backup, snapshot, archive.

**ManifestHeader**:
The `{schema_version, fulcrum_version, exported_at, counts, column_types}` block under `manifest.manifest`.
_Avoid_: Metadata, envelope.

**ExportableColumn**:
A column the export-redaction filter keeps in the manifest after stripping secret-marked columns.
_Avoid_: Allowed column, visible field.

**RedactedRow**:
A row passed through `redactExportRow`; rows from the `credentials` table additionally carry `redacted: true`.
_Avoid_: Scrubbed row, sanitized row.

**ImportCollision**:
A `{kind, id}` pair where the manifest row's `id` already exists in the destination table.
_Avoid_: Duplicate, conflict row.

**ConflictPolicy**:
The closed enum `skip | update | error` selecting how `runImportManifest` resolves an **ImportCollision**.
_Avoid_: Merge mode, strategy.

**ImportOutcome**:
The `{imported, updated, skipped}` count returned by `runImportManifest`.
_Avoid_: Result, summary.

## Relationships

- An **ImportManifest** carries one **ManifestHeader** and many table arrays of **RedactedRows**.
- `createExportManifest` selects **ExportableColumns** per table, then writes **RedactedRows** into the **ImportManifest**.
- `listImportCollisions` reads an **ImportManifest** and returns every **ImportCollision** against the live database.
- `runImportManifest` applies one **ConflictPolicy** to all **ImportCollisions** and returns one **ImportOutcome**; the `credentials` table is always skipped.

## Example dialogue

> **Dev:** "What happens to the `credentials` table on import?"
> **Domain expert:** "Always skipped. Export tags those **RedactedRows** with `redacted: true`, and `runImportManifest` short-circuits the `credentials` kind into `skipped` regardless of **ConflictPolicy**."
> **Dev:** "And if a task row already exists?"
> **Domain expert:** "That's an **ImportCollision**. Under `skip` it bumps `skipped`; under `update` it does an `on conflict (id) do update`; under `error` it throws `AppConflictError` and the transaction rolls back."

## Flagged ambiguities

- **ImportManifest vs CSV import** — this area only handles the JSON **ImportManifest**. Single-table CSV task import lives in `application/data-exchange/csv-import.ts` and is not an **ImportManifest**.
- **ConflictPolicy `skip` vs credentials skip** — credentials rows are unconditionally counted as `skipped` in the **ImportOutcome** even when **ConflictPolicy** is `update` or `error`; the policy applies to all other tables.
- **column_types** — the **ManifestHeader** field drives Postgres `ARRAY` literal coercion on import; rows without a matching `column_types` entry for a column are dropped from the insert, not failed.
