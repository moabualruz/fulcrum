---
Status: implemented
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/01-trpc-router-scaffold.md, 13/issues/03-zod-schema-registry.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q28, Q-flag-granularity, C1, C5, Q-cross-cut]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: []
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

Define the `ConnectorAdapter` interface (`src/connectors/interface.ts`) and connector registry (`connectors` + `connector_runs` tables). Interface: `pull(): Promise<SyncResult>`, `push(items: SyncItem[]): Promise<SyncResult>`, `healthCheck(): Promise<HealthStatus>`, `kind: ConnectorKind`. Schema: `connectors(id, org_id, kind, name, config jsonb, enabled, last_sync_at)` with `UNIQUE(org_id, kind)` and `connector_runs(id, org_id, connector_id, status, started_at, ended_at, stats jsonb)`. Flag guard: `connectors.enable(kind)` throws `FeatureDisabledError` when per-connector flag is OFF. graphile-worker job `connector-sync` writes `connector_runs` row on sync start/complete/fail.

- **Web**: `/settings/connectors` — connector cards, enable/disable, config form, last-sync, run history.
- **CLI**: `fulcrum connectors list|enable|disable|sync|runs|config --json`.
- **TUI**: Settings → Connectors screen: cards, `Enter` config pane, `s` sync, run log.

## Acceptance criteria

- [ ] `ConnectorAdapter` interface compiles; TypeScript enforces `pull()`, `push()`, `healthCheck()` signatures on all adapters.
- [ ] Migration class `Migration<timestamp>` covering `Connector` + `ConnectorRun` entities idempotent (MikroORM snapshot diff); `@Unique({ properties: ['orgId', 'kind'] })` tested; `kind` `@Enum` covers all 8 kinds.
- [ ] `connectors.enable('jira')` with `connector-jira` flag OFF → `FeatureDisabledError`; ON → row created with `enabled=true`.
- [ ] `connector-sync` graphile-worker job: inserts `connector_runs(status='running')` on start; updates `stats` on complete; `status='failed'` on adapter throw.
- [ ] `connectors.*` tRPC procedures (list/get/enable/disable/sync/runs/config) all tested with Zod validated output.
- [ ] Web cards, CLI `fulcrum connectors list --json`, TUI connector list all show same `enabled` state from same DB.

## Blocked by

- 13/issues/01-trpc-router-scaffold.md
- 13/issues/03-zod-schema-registry.md

## Notes

P13.23–P13.25 + P13.32 maps to this slice. Per-connector adapters (Jira, Linear, etc.) are next slices.
