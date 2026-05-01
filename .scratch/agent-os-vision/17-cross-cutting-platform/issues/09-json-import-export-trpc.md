---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, B8, C4]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B8 import/export)
Docs: https://bun.sh/docs/api/streams
---

# Native JSON import/export — export.ts, import.ts, dataExport.*/dataImport.* tRPC, CLI surfaces

## What to build

`src/data/export.ts`: streams full org dump — all entity kinds (orgs, projects, tasks, docs, memories, sprints, agent_runs summary, repos, artifacts metadata, events summary) as a single JSON object with one top-level array per kind; large collections paged internally; UUIDs preserved; credentials plaintext never included; schema version stamped in manifest header. `src/data/import.ts`: reads JSON manifest; validates each entity array via Zod schemas (matching `export.ts` shape); `preflight` → entity counts + collision list (UUID matches); `run(options)` → inserts/updates with `--on-conflict skip|update|error`; `--dry-run` reports without writing. `dataExport.create` / `dataImport.preflight(path)` / `dataImport.run(importId, options)` tRPC procedures. CLI: `fulcrum export [--format json|csv] [--entity <kind>] [--output <path>] [--pretty]`; `fulcrum import --input <path> [--dry-run] [--on-conflict skip|update|error]`.

Cuts through: `fulcrum export --output /tmp/org.json` → streams all tables → manifest stamped → `fulcrum import --input /tmp/org.json --dry-run` → preflight counts → `--on-conflict update` → all rows inserted.

## Acceptance criteria

- [ ] Export: all entity kinds present in output JSON; UUID values preserved; no credentials plaintext; manifest contains `schema_version`, `fulcrum_version`, `exported_at`, per-kind row counts.
- [ ] Export 50k rows: completes <60s p99; streams (no full in-memory buffer > 100MB).
- [ ] Import `preflight`: returns entity counts + list of colliding UUIDs with entity kind.
- [ ] Import `run --on-conflict update`: all rows present; idempotent second run → same result.
- [ ] Import `run --on-conflict error`: stops on first collision; partial writes rolled back (transaction).
- [ ] Import `--dry-run`: reports counts without any DB writes.
- [ ] CLI `fulcrum export --format json --output /tmp/org.json --pretty` → valid indented JSON.
- [ ] CLI `fulcrum import --input /tmp/org.json --on-conflict skip --json` → `{imported: N, skipped: M, errors: 0}`.
- [ ] Vitest: export/import round-trip on in-memory PGlite; 1000 tasks preserved.

## Blocked by

- Issue 01 (schema) — all entity tables must exist (via earlier pillar migrations).
