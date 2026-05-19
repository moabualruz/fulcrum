# Importer Field Mapping

Per-source translation layer that converts a vendor issue payload (Linear GraphQL, Jira REST v3, Plane API) into the canonical **ImportedTask** shape consumed by an **ImportRun**.

## Language

**ImportedTask**:
The Fulcrum-canonical task record (`title`, `description`, `status`, `priority`, `assignee`, `labels`, `dueDate`, `estimate`, `customFields`) emitted by every **FieldMap**.
_Avoid_: FulcrumTask DTO, normalized issue, target row.

**FieldMap**:
A pure function `map<Source>Issue(issue) → ImportedTask` that owns one vendor's field translation and nothing else.
_Avoid_: Mapper, transformer, converter.

**PriorityMap**:
The Linear-only lookup that resolves Linear's numeric `priority` (0–4) to the string priority labels (`urgent`/`high`/`medium`/`low`/`none`) used by **ImportedTask**.
_Avoid_: Priority lookup, severity table.

**AdfFlattening**:
The Jira-only pass that walks an Atlassian Document Format `description` tree and joins its `text` nodes into a plain string.
_Avoid_: Rich text parse, ADF render, description normalize.

**StoryPointsExtraction**:
The Jira-only probe across `story_points`, `customfield_10016`, and `customfield_10028` that resolves a numeric `estimate` for **ImportedTask**.
_Avoid_: Custom field lookup, points resolver.

**SourceIdStamp**:
The `customFields` entry (`linear_issue_id` / `jira_issue_id` / `plane_issue_id`) that preserves the originating vendor identifier on every **ImportedTask**.
_Avoid_: External id, foreign key, provenance tag.

**RetryableCall**:
A `withRetry`-wrapped HTTP call that retries on `HttpError` 429/5xx and on `ECONNREFUSED`/`ECONNRESET`/`ETIMEDOUT`/`ENOTFOUND`/`UND_ERR_CONNECT_TIMEOUT` network codes.
_Avoid_: Backoff loop, resilient fetch.

## Relationships

- One **ImporterName** (`linear`/`jira`/`plane`) owns exactly one **FieldMap** and one source-importer class in this folder.
- Every **FieldMap** returns one **ImportedTask** per vendor issue and stamps exactly one **SourceIdStamp**.
- Only the Linear **FieldMap** consults the **PriorityMap**; only the Jira **FieldMap** runs **AdfFlattening** and **StoryPointsExtraction**.
- A source-importer class wraps each paginated API call in a **RetryableCall** before handing nodes to its **FieldMap**.

## Example dialogue

> **Dev:** "Where do I normalize the Jira description rich-text blob?"
> **Domain expert:** "Inside `jira.fieldmap.ts` via **AdfFlattening** — the **FieldMap** owns vendor-shape decisions. Don't add ADF handling to the source-importer class or to `types.ts`."
> **Dev:** "And if Linear adds a new priority level?"
> **Domain expert:** "Extend the **PriorityMap** in `linear.fieldmap.ts`. The **ImportedTask** contract stays string-typed, so no parent **Importers** code changes."

## Flagged ambiguities

- **estimate vs story points** — Linear and Plane expose a numeric `estimate`/`estimate_point` directly; Jira requires **StoryPointsExtraction**. Both land in the same `estimate: number | null` slot on **ImportedTask** — do not introduce a separate `storyPoints` field.
- **assignee source** — Jira's **FieldMap** intentionally reads `fields.reporter`, not `fields.assignee`, per the importer acceptance criteria; Linear and Plane read their native assignee. Do not "fix" the Jira branch to use `assignee` without revisiting that criterion.
