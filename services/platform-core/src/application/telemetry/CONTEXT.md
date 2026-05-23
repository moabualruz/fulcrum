# Telemetry

Org-scoped product analytics: consent gate, scrubbed payload writes, opt-in/out/purge audit. Sub-area of platform-core; reuses parent **TelemetryEvent** and **TenantSetting** without redefining them.

## Language

**TelemetryConsent**:
A user's local decision record (`optedIn`, `decidedAt`, `scope`) persisted in `~/.fulcrum/settings.json` under the `telemetry` key.
_Avoid_: opt-in flag, preference, toggle state

**TelemetryScope**:
The frozen allow-list of payload categories a consenting user agrees to share (`command_usage_counts`, `render_durations_ms`, `anonymized_error_codes`).
_Avoid_: data classes, fields, permissions

**OptInSetting**:
The org-scoped `TenantSetting` row at key `telemetry.opted_in` that gates server-side writes.
_Avoid_: consent row, flag, toggle

**TelemetryStore**:
The abstract write/read/count/purge port over `TelemetryEvent`; the live implementation is `MikroTelemetryStore`.
_Avoid_: repository, dao, telemetry service

**PayloadScrub**:
The recursive transform that replaces every string leaf in a payload with `null` before persistence.
_Avoid_: sanitize, redact, anonymize step

**ConsentAuditVerb**:
One of `telemetry.opted_in | telemetry.opted_out | telemetry.purged`, written to the outbox via `recordAudit`.
_Avoid_: consent event, telemetry log

## Relationships

- A **TelemetryConsent** is per-user and local-disk; an **OptInSetting** is per-org and database-backed. Both must be true for `writeTelemetryEvent` to persist.
- A **TelemetryStore** write applies **PayloadScrub** then creates a parent **TelemetryEvent**.
- A consent flip or purge emits a **ConsentAuditVerb** through the workflow-coordination outbox (not a **TelemetryEvent**).
- **TelemetryScope** bounds what callers may put in a payload; it does not enforce — **PayloadScrub** is the enforcement.

## Example dialogue

> **Dev:** "User toggled opt-in in the TUI — do I update the **TelemetryConsent** file or the **OptInSetting**?"
> **Domain expert:** "Both. The file is the local-first record of the user's choice; the **OptInSetting** is what `writeTelemetryEvent` checks per org. Then emit a `telemetry.opted_in` **ConsentAuditVerb** through the outbox."
> **Dev:** "Render-duration payload has a `route` string — keep it?"
> **Domain expert:** "**PayloadScrub** nulls every string. If the route matters, encode it as an enum index — strings are treated as PII by default."

## Flagged ambiguities

- "consent" referred to both the on-disk **TelemetryConsent** and the db-backed **OptInSetting** — resolved: two artifacts, both required; file is user-scope, setting is org-scope.
- "telemetry event" was confused with audit — resolved: a **TelemetryEvent** (parent term) is analytics; a **ConsentAuditVerb** through the outbox records consent state changes.
