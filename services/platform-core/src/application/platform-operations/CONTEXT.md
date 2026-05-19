# Platform Operations

Cross-cutting operational primitives for platform-core: validated audit-event emission, cross-cutting capability/surface coverage, doctor readiness checks, gated remote telemetry flush, and graceful shutdown coordination.

## Language

**PlatformEventInput**:
The validated input passed to `emitPlatformEvent`, naming `subjectKind`, `verb`, `subjectId`, and a per-key Zod-schema-checked `payload`.
_Avoid_: audit input, event row, log record

**EventSink**:
An async port that persists an `EmittedEvent`, defaulting to a TypeORM-backed sink and swappable in tests.
_Avoid_: writer, dispatcher, recorder

**PayloadSchemaRegistry**:
The map of `${subjectKind}.${verb}` keys to Zod schemas that emission is gated on; unregistered keys throw.
_Avoid_: event types, allowed events

**ForbiddenPayloadKey**:
A reserved payload key name (e.g. `value`, `secret`, `token`, `apiKey`, `encrypted_value`) that schemas must reject to keep plaintext secrets out of audit rows.
_Avoid_: sensitive field, banned key

**CrossCuttingCapability**:
A registered capability id (e.g. `i18n`, `telemetry`, `secrets`, `graceful-shutdown`) tied to PRD requirement codes and the set of surfaces that must implement it.
_Avoid_: feature, concern, area

**CrossCuttingSurface**:
A delivery channel — `web | cli | tui | trpc | rest` — that a capability must reach.
_Avoid_: client, frontend, transport

**PlatformDoctorCheck**:
A single `{ name, status, message, recovery, checked_at }` record produced by `runPlatformDoctorChecks`, with `status` in `pass | warn | fail | skip`.
_Avoid_: health probe, doctor row, diagnostic

**TelemetryOutboxEntry**:
An in-process row mirroring `telemetry_outbox` (`batchJson`, `attempts`, `lastAttemptAt`, `status`) flushed only while the `telemetry-remote` flag is on.
_Avoid_: telemetry job, queue item, batch row

**OutboxStatus**:
The lifecycle state of a `TelemetryOutboxEntry`: `queued → retrying | sent | dead`.
_Avoid_: state, phase

**TelemetryBatchPayload**:
The PII-stripped POST body containing up to `BATCH_MAX_SIZE` events (`id`, `kind`, `payload`, `occurredAt`) signed with `X-Fulcrum-Signature`.
_Avoid_: telemetry blob, upload, dump

**GracefulShutdownHooks**:
The named callbacks (`stopWorkers`, `closeSubscriptions`, `closeHttpServer`, `closeDatabase`, `cleanupWorkspaces`) run in fixed `ORDER` by `createGracefulShutdown`.
_Avoid_: teardown steps, exit handlers

**GracefulShutdownResult**:
The terminal record returned for a shutdown signal, listing `completed` hooks and either `ok: true` or the first `failed` hook with its `error`.
_Avoid_: exit report, shutdown log

## Relationships

- An **emitPlatformEvent** call resolves a schema from the **PayloadSchemaRegistry**, validates against **ForbiddenPayloadKey** rules, then hands an `EmittedEvent` to an **EventSink** which (in production) writes a platform-core `Event`.
- A **CrossCuttingCapability** owns one-or-more PRD requirement codes and a required set of **CrossCuttingSurfaces**; `missingCrossCuttingSurfaces` reports gaps per capability.
- A **PlatformDoctorCheck** is emitted per capability area (theme, keyring, credentials, crashlog, backup, telemetry, flags, i18n, remote-backup, remote-telemetry, error-reporting); doctor inputs are injectable for tests.
- A **TelemetryOutboxEntry** transitions through **OutboxStatus** during `flushTelemetryOutbox`: `200 → sent`, `429 → retrying`, `5xx < maxRetries → retrying` else `dead`, `4xx → dead`.
- A **GracefulShutdown** processes a `ShutdownSignal` exactly once (memoised) and runs **GracefulShutdownHooks** in the fixed `ORDER`, stopping at the first failure.

## Example dialogue

> **Dev:** "We added a new `backup.exported` audit event. Anything beyond defining the entity?"
> **Domain expert:** "Register the payload Zod schema in the **PayloadSchemaRegistry** under `backup.exported`. `emitPlatformEvent` throws on unregistered keys, and the schema enforces **ForbiddenPayloadKey** so no `value`/`token` slips into the row."
> **Dev:** "And the doctor row for the remote endpoint — where does that live?"
> **Domain expert:** "`runPlatformDoctorChecks` emits a `platform.remote_telemetry` **PlatformDoctorCheck`; status is `skip` when the `telemetry-remote` flag is off, `warn` when the **TelemetryOutboxEntry** dead-letter set is non-empty."

## Flagged ambiguities

- "shutdown event" overlapped the audit `system.shutdown.completed` **PlatformEventInput** and the **GracefulShutdownResult** returned by the coordinator — resolved: the coordinator returns a `GracefulShutdownResult` in-process; emitting the audit event is a separate `emitPlatformEvent` call that the caller makes after a successful shutdown.
- "telemetry" overlapped the parent `TelemetryEvent` entity, the **TelemetryOutboxEntry** awaiting remote flush, and the **TelemetryBatchPayload** posted to the endpoint — resolved: entity is the per-org analytics row, outbox entry is the queued batch row, batch payload is the sanitised wire body with user IDs stripped.
