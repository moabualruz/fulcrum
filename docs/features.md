# Fulcrum Features Guide

## Overview

Fulcrum = local-first Agent OS. Everything runs on machine — no cloud. Embedded PGlite handles all storage. SaaS features shipped but disabled behind feature flags.

## Core Features (Always On)

### Project Management

Create projects, manage tasks w/ kanban, plan sprints, track velocity.

```bash
fulcrum projects create --name "My App" --json
fulcrum tasks create --title "Set up CI" --project my-app --status todo --json
fulcrum tasks list --project my-app --status in_progress --json
```

**Web:** `/projects/<id>/board` — drag-drop kanban w/ custom columns.

### Documents

TipTap rich text editor w/ version history, comments, templates.

```bash
fulcrum docs create --title "Architecture" --type decision --json
fulcrum docs list --json
```

**Web:** `/docs/<id>/edit` — editor w/ autosave, `/docs/<id>/history` — version diffs.

### Search

Full-text search across tasks, docs, memories. Faceted filtering by kind, project, date range.

```bash
fulcrum search "database migration" --json
```

**Web:** `/search` — left-rail facets, saved searches, result grouping by kind.

### Agent Orchestration (Symphony)

Dispatch agent runs, monitor progress, handle retries/stalls.

```bash
fulcrum runs list --json
fulcrum runs logs <run-id>
fulcrum agent list --json
```

**Web:** `/orchestration` — live run queue w/ claim-state badges, cancel/retry controls.

### Memory & Context

Heuristic extraction from agent runs. BM25 retrieval. Context assembly for agent prompts.

```bash
fulcrum memory list --json
fulcrum memory search "TypeScript patterns" --json
```

**Web:** `/memory` — browsable list w/ importance scores, source links.

### Repository Supervision

Register repos, browse files, view commit history, link tasks to repos.

```bash
fulcrum repos add --path /path/to/repo --name my-repo
fulcrum repos list --json
```

**Web:** `/repos/<id>/files` — lazy-loading file tree w/ syntax highlighting.

### Notifications & Audit

Rule-based notification engine. In-app inbox. Full audit log w/ CSV/JSON export.

```bash
fulcrum notifications list --json
fulcrum audit query --kind task --json
fulcrum audit export --format csv --output audit.csv
```

**Web:** `/inbox` — notification feed w/ mark-read. `/audit` — filterable event log.

### Doctor

Health checks across all 17 subsystems. Recovery hints on failure.

```bash
fulcrum doctor --json
fulcrum doctor --subsystem inference
```

**Web:** `/doctor` — dashboard w/ auto-refresh every 30s. No auth required.

### Backups

Local backup/restore. Full data export.

```bash
fulcrum backup --output /tmp/fulcrum-backup.tar.gz
fulcrum restore --input /tmp/fulcrum-backup.tar.gz
```

## Gated Features

Enable w/ `FULCRUM_FEATURES=<flag1>,<flag2>` env var.

### i18n (`i18n`)

Locale selector (English, Arabic, French). RTL layout. Intl date/number formatting.

### Semantic Search (`embeddings`)

Hybrid BM25 + cosine similarity. Requires inference sidecar for embeddings.

### Experiments / A/B Testing (`experiments`)

Create experiments w/ variants, rollout percentages. Track assignments, conversion metrics.

### PWA Offline Mode (`pwa-offline`)

Service worker caches app shell. Background sync queues offline mutations. `/offline` fallback.

### Desktop App (`desktop-app`)

Tauri v2 wrapper. Native drag-drop artifact upload. Auto-update.

### Real-Time Collaboration (`real-time-collab-server`)

Yjs + Hocuspocus CRDT sync for TipTap. Collab cursors w/ name badges. Presence avatars.

### SaaS Auth (`saas-auth`)

OAuth (Google, GitHub), magic-link login, signup flow, billing placeholder.

### Public API (`public-api`)

OpenAPI 3.1 REST at `/api/v1`. API key management. Spec viewer.

### CSV Import/Export (`export-csv`, `import-csv`)

Export tasks/docs/memories as CSV. Import w/ column mapper.

### External Importers (`import-linear`, `import-jira`, `import-plane`)

Import projects/tasks from Linear, Jira, Plane w/ field mapping.

### Remote Telemetry (`telemetry-remote`)

HMAC-signed batch POST of telemetry events to user-configured endpoint.

### Remote Error Reporting (`error-reporting-remote`)

Crash reports w/ scrubbed stack traces. HMAC-signed POST.

### Vault Integration (`vault-integration`)

HashiCorp Vault KV v2 + AWS Secrets Manager as secret providers.

### Scheduled Backups (`scheduled-backups`)

Cron-based backups to S3, R2, GCS, Azure Blob Storage.

### LLM Sprint Narrative (`report-llm-narration`)

AI-generated sprint retro narrative via inference sidecar.

## Configuration

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `FULCRUM_HOME` | Data directory | `~/.fulcrum` |
| `FULCRUM_FEATURES` | Comma-separated feature flags | (empty — all gated features off) |
| `FULCRUM_REQUIRE_AUTH` | Require login (SaaS mode) | (unset — dev mode, no login) |
| `ANTHROPIC_API_KEY` | For inference sidecar | (none) |
| `FULCRUM_INFERENCE_BACKEND` | `embedded`, `ollama`, `lm-studio`, `openai-compatible` | `embedded` |

### Three Surfaces

Every feature ships on all three:

1. **Web** — SvelteKit app at `localhost:5173`
2. **CLI** — `fulcrum <command> [--json]`
3. **TUI** — `fulcrum tui` — full terminal UI w/ 44 screens