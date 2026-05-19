# Importers

Application-layer entry point for one-shot historical imports: lists available **Importers**, gates each by feature flag, and runs **Preflight** before a full **ImportRun**.

## Language

**ImporterName**:
The closed enum of importer identifiers (`csv`, `linear`, `jira`, `plane`) used as the public action key and feature-flag suffix.
_Avoid_: Source kind, importer type, provider.

**ImporterDescriptor**:
A `{name, enabled}` pair returned by `listImporters`, where `enabled` reflects the `import-<name>` feature flag for the current process env.
_Avoid_: Importer info, capability record.

**Preflight**:
A dry-run validation pass against the importer input (CSV file or API key) that returns `{rowCount, columns}` without writing any **FulcrumTask**.
_Avoid_: Dry-run, preview, validation.

**ImporterPreflightInput**:
Tagged union of `CsvPreflightInput` (`{importerName: "csv", file}`) and `ApiPreflightInput` (`{importerName, apiKey}`).
_Avoid_: Importer config, request payload.

**ImporterColumnMapping**:
A `{source, target}` pair binding one external column name to one Fulcrum field; the per-row contract a **FieldMap** resolves to.
_Avoid_: Column map entry, field binding.

**ImportResult**:
Persisted outcome of one **ImportRun**: `{id, importerName, importedAt, rowCount, status, message}`.
_Avoid_: Run record, import log.

**ImportRun**:
A single invocation of `runImporter` that consumes a validated input and produces one **ImportResult**.
_Avoid_: Import job, execution, task.

## Relationships

- An **ImporterName** has exactly one **ImporterDescriptor** per env (enabled or not).
- A **Preflight** must succeed before an **ImportRun** is allowed.
- An **ImportRun** produces exactly one **ImportResult**; `listImportHistory` returns prior **ImportResults**.
- The `csv` **ImporterName** consumes a `File`; all other **ImporterNames** consume an `apiKey` and delegate to a `sources/<kind>/` adapter using a `field-mapping/<kind>` **FieldMap**.

## Example dialogue

> **Dev:** "Can I call `runImporter` straight from the web action?"
> **Domain expert:** "No — clients must call `preflightImporter` first to get a **Preflight** result. `runImporter` itself only resolves when an application import service is wired in; without it the action throws `AppInvariantError`."
> **Dev:** "And the `csv` path skips the API key check?"
> **Domain expert:** "Right. `csv` reads a `File`; the other **ImporterNames** require `apiKey` and dispatch into `sources/`. Both paths still gate on `isImporterEnabled`."

## Flagged ambiguities

- **Importer vs Connector** — already resolved by the parent CONTEXT; within this area "Importer" always means a one-shot historical path under `application/importers/`, never an ongoing-sync **Connector**.
- **Preflight vs ImportRun** — distinct phases: **Preflight** validates and reports shape; **ImportRun** writes **FulcrumTasks** and emits an **ImportResult**. Do not collapse them into one call.
