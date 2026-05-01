---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, B5, C4]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B5 telemetry opt-in)
Docs: https://kit.svelte.dev/docs
---

# Local telemetry collection — collector.ts, opt-in prompt, telemetry.* tRPC, CLI + Web + TUI surfaces

## What to build

`src/telemetry/collector.ts`: opt-in write gate — writes `telemetry_events` rows only when `tenant_settings(key='telemetry.opted_in')='true'`; payload stripped of all content (no titles, bodies, file paths); only event kind + aggregate counts + duration metrics. First-run opt-in prompt: CLI interactive Y/N on first `fulcrum init` or `fulcrum web`; Web banner with "Enable" / "No thanks" buttons; TUI modal. Idempotent: no double-prompt. `telemetry.*` tRPC: `optIn`, `optOut`, `status` (returns `opted_in` boolean + `telemetry_events` row count), `purge` (deletes all rows). CLI: `fulcrum telemetry status/opt-in/opt-out/purge [--json]`. Web: `/settings/telemetry` (Pillar 16 issue 18). TUI: Settings → Telemetry tab.

Cuts through: first `fulcrum init` → CLI prompt → `Y` → `telemetry.opted_in=true` → next event → `collector.write` → DB row written.

## Acceptance criteria

- [ ] First-run prompt: CLI → Y/N → stored; Web → banner → button → stored; TUI → modal → button → stored; idempotent (no re-prompt on subsequent runs after answering).
- [ ] `collector.write(kind, payload)`: opted-out → no DB write (verified by row count assertion); opted-in → row written; payload has no string values (only number/boolean/null).
- [ ] `telemetry.status --json`: returns `{opted_in: bool, row_count: N}`.
- [ ] `telemetry.purge`: deletes all `telemetry_events` rows; row count → 0.
- [ ] Default: opted-out if prompt never answered (`tenant_settings` row absent → treat as `false`).
- [ ] Doctor: `platform.telemetry` check verifies `opted_in` has a value; info-only not failure.
- [ ] Vitest: opted-out → write is no-op; opted-in → write succeeds; purge → count 0.

## Blocked by

- Issue 01 (schema) — `telemetry_events` table + `tenant_settings` must exist.
