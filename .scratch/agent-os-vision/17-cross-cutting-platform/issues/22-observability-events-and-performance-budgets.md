---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/06-telemetry-collector-trpc-and-surfaces.md, 17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md, 17-cross-cutting-platform/issues/03-backup-restore-trpc.md, 17-cross-cutting-platform/issues/07-feature-flag-rollout-trpc.md, 17-cross-cutting-platform/issues/09-json-import-export-trpc.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, C4]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (A1 toolchain SLA)
Docs: https://bun.sh/docs
---

# Observability — events emit from all tRPC procedures, performance budgets, audit event schemas

## What to build

Every Pillar 17 tRPC procedure emits an `events` row (Pillar 12 audit log) on mutation. Event shapes: `subject_kind ∈ {credential, backup, telemetry_event, feature_flag, experiment, error_log}`, `verb ∈ {created, updated, deleted, rotated, archived, opted_in, opted_out, purged, enabled, disabled, exported, imported}`, `payload` contains entity-type-specific fields with no plaintext secret values. Performance instrumentation: `Bun.performance.now()` spans on `credentials.get` (decrypt), `theme.get` (CSS var block cold), `flags.isEnabled()` (warm cache), `backup.create`, `dataExport.create`, `telemetry_events` write — duration logged to `telemetry_events.payload.duration_ms` when opted in. Performance budget assertions in Vitest:

| Operation | Budget |
|---|---|
| `credentials.get` decrypt | < 5ms p99 |
| `theme.get` cold | < 10ms p99 |
| `flags.isEnabled()` warm | < 1ms p99 |
| `backup.create` 10k tasks no artifacts | < 30s |
| `dataExport.create` 50k rows | < 60s |
| `telemetry_events` write | < 2ms p99 |
| `/settings/secrets` cold load 20 creds | < 150ms p99 |

## Acceptance criteria

- [ ] Every mutation tRPC procedure emits `events` row with correct `subject_kind` + `verb` + `payload` (no plaintext secrets).
- [ ] Event payload Zod schemas registered per event type; `events.payload` validated on write (fails CI if schema unregistered).
- [ ] Performance budgets: all 7 Vitest timer assertions pass on in-process PGlite test fixture with appropriate seed data.
- [ ] `credentials.get` decrypt < 5ms: measured with `Bun.performance.now()` across 20 iterations; p99 assertion.
- [ ] `flags.isEnabled()` warm cache < 1ms: cache populated before measurement.
- [ ] `backup.create` 10k tasks < 30s: Vitest with PGlite seeded with 10k tasks; `--no-artifacts`.
- [ ] `telemetry_events` write < 2ms: 100 sequential writes; p99 assertion.
- [ ] `fulcrum doctor --json` all-checks (platform.*) < 3s total: Vitest timer.
- [ ] Events emitted: `credentials.set` → event; `backup.create` → event; `flags.set` → event; `telemetry.optIn` → event; `dataExport.create` → event; `dataImport.run` → event.

## Blocked by

- All previous Pillar 17 tRPC issues — procedures must exist to add event emit + span instrumentation.
