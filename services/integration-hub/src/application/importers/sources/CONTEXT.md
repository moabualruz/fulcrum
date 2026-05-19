# Importer Sources

Per-vendor adapters that fetch issues from an external PM tool (Linear, Jira, Plane) over HTTP and hand them to a **FieldMap** to produce **FulcrumTasks** for the parent **ImportRun**.

## Language

**SourceAdapter**:
A single `importFrom<Vendor>` function that loads credentials, calls the vendor API, and maps each **VendorIssue** through its **FieldMap**.
_Avoid_: Connector, driver, provider client.

**VendorIssue**:
The raw issue shape returned by one vendor API (`LinearIssue`, `JiraIssue`, `PlaneIssue`) before mapping.
_Avoid_: Ticket, record, external task.

**CredentialRepository**:
The minimal `{get(key)}` port used to resolve per-vendor secrets (`LINEAR_API_KEY`, `JIRA_HOST`/`JIRA_EMAIL`/`JIRA_API_TOKEN`, `PLANE_API_TOKEN`, `PLANE_HOST`) at run time.
_Avoid_: Secret store, vault client.

**HttpClient**:
The injected `{get, post}` port every **SourceAdapter** calls; mockable in `importers.test.ts`.
_Avoid_: Fetcher, transport, agent.

**WithRetry**:
The local exponential-backoff wrapper (max 3 attempts, retries on `429` / `network` / `timeout`) each **SourceAdapter** wraps its HTTP call in.
_Avoid_: Retry policy, backoff helper.

**ImportOptions**:
The `{dryRun?, json?}` flags that suppress writes (`dryRun` forces `imported = 0`) and toggle JSON output for CLI callers.
_Avoid_: Run flags, config.

**SourceImportResult**:
The `{imported, skipped, errors[]}` shape each **SourceAdapter** returns to the parent `runImporter`; distinct from the persisted **ImportResult** in the parent area.
_Avoid_: Run record, summary.

## Relationships

- One **ImporterName** (non-`csv`) maps to exactly one **SourceAdapter** in this folder.
- A **SourceAdapter** depends on one **CredentialRepository**, one **HttpClient**, and one sibling **FieldMap** (`<vendor>.fieldmap.ts`).
- Every **SourceAdapter** wraps its outbound call in **WithRetry** and feeds each **VendorIssue** through its **FieldMap** to yield a **FulcrumTask**.
- A **SourceAdapter** returns one **SourceImportResult**; the parent `runImporter` lifts it into the persisted **ImportResult**.

## Example dialogue

> **Dev:** "Where does the Linear API key come from inside `importFromLinear`?"
> **Domain expert:** "From the injected **CredentialRepository** under key `LINEAR_API_KEY` — the adapter never reads env directly. Jira pulls three keys (`JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`); Plane pulls `PLANE_API_TOKEN` plus optional `PLANE_HOST`."
> **Dev:** "And if the request 429s?"
> **Domain expert:** "**WithRetry** kicks in — up to 3 attempts with exponential backoff. Anything that isn't `429` / `network` / `timeout` rethrows immediately."

## Flagged ambiguities

- **SourceImportResult vs ImportResult** — same field names exist in both layers but mean different things: this folder's `{imported, skipped, errors[]}` is an in-process adapter return; the parent area's **ImportResult** is the persisted run record. Do not unify the types across the boundary.
- **SourceAdapter vs Connector** — adapters here are one-shot historical importers, not ongoing-sync **Connectors**; the word "connector" stays out of this area.
