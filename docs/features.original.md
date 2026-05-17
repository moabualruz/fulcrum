# Fulcrum Features Guide

## Overview

Fulcrum is a local-first Agent OS. Everything runs on your machine — no cloud dependency. The embedded PGlite database handles all storage. SaaS features (multi-tenant auth, remote telemetry, etc.) are shipped but disabled behind feature flags.

## Core Features (Always On)

### Project Management

Create projects, manage tasks with kanban boards, plan sprints, track velocity.

```bash
fulcrum projects create --name "My App" --json
fulcrum tasks create --title "Set up CI" --project my-app --status todo --json
fulcrum tasks list --project my-app --status in_progress --json
```

**Web:** `/projects/<id>/board` — drag-and-drop kanban board with custom columns.

### Documents

TipTap-based rich text editor with version history, comments, and templates.

```bash
fulcrum docs create --title "Architecture" --type decision --json
fulcrum docs list --json
```

**Web:** `/docs/<id>/edit` — full editor with autosave, `/docs/<id>/history` — version diffs.

### Search

Full-text search across tasks, docs, and memories. Faceted filtering by kind, project, date range.

```bash
fulcrum search "database migration" --json
```

**Web:** `/search` — left-rail facets, saved searches, result grouping by kind.

### Agent Orchestration (Symphony)

Dispatch agent runs, monitor progress, handle retries and stalls.

```bash
fulcrum runs list --json
fulcrum runs logs <run-id>
fulcrum agent list --json
```

**Web:** `/orchestration` — live run queue with claim-state badges, cancel/retry controls.

### Memory & Context

Heuristic extraction from agent runs. BM25 retrieval. Context assembly for agent prompts.

```bash
fulcrum memory list --json
fulcrum memory search "TypeScript patterns" --json
```

**Web:** `/memory` — browsable memory list with importance scores and source links.

### Repository Supervision

Register repos, browse files, view commit history, link tasks to repos.

```bash
fulcrum repos add --path /path/to/repo --name my-repo
fulcrum repos list --json
```

**Web:** `/repos/<id>/files` — lazy-loading file tree with syntax highlighting.

### Notifications & Audit

Rule-based notification engine. In-app inbox. Full audit log with CSV/JSON export.

```bash
fulcrum notifications list --json
fulcrum audit query --kind task --json
fulcrum audit export --format csv --output audit.csv
```

**Web:** `/inbox` — notification feed with mark-read. `/audit` — filterable event log.

### Doctor

Health checks across all 17 subsystems. Recovery hints for failures.

```bash
fulcrum doctor --json
fulcrum doctor --subsystem inference
```

**Web:** `/doctor` — dashboard with auto-refresh every 30s. No auth required.

### Backups

Local backup and restore. Full data export.

```bash
fulcrum backup --output /tmp/fulcrum-backup.tar.gz
fulcrum restore --input /tmp/fulcrum-backup.tar.gz
```

## Gated Features

Enable with `FULCRUM_FEATURES=<flag1>,<flag2>` environment variable.

### i18n (`i18n`)

Locale selector (English, Arabic, French). RTL layout support. Intl date/number formatting.

### Semantic Search (`embeddings`)

Hybrid BM25 + cosine similarity search. Requires inference sidecar for embeddings.

### Experiments / A/B Testing (`experiments`)

Create experiments with variants and rollout percentages. Track assignment counts and conversion metrics.

### PWA Offline Mode (`pwa-offline`)

Service worker caches app shell. Background sync queues offline mutations. `/offline` fallback page.

### Desktop App (`desktop-app`)

Tauri v2 wrapper. Native drag-and-drop artifact upload. Auto-update.

### Real-Time Collaboration (`real-time-collab-server`)

Yjs + Hocuspocus CRDT sync for TipTap editor. Collab cursors with name badges. Presence avatars.

### SaaS Auth (`saas-auth`)

OAuth (Google, GitHub), magic-link login, signup flow, billing placeholder.

### Public API (`public-api`)

OpenAPI 3.1 REST API at `/api/v1`. API key management. OpenAPI spec viewer.

### CSV Import/Export (`export-csv`, `import-csv`)

Export tasks/docs/memories as CSV. Import with column mapper.

### External Importers (`import-linear`, `import-jira`, `import-plane`)

Import projects and tasks from Linear, Jira, or Plane with field mapping.

### Remote Telemetry (`telemetry-remote`)

HMAC-signed batch POST of telemetry events to user-configured endpoint.

### Remote Error Reporting (`error-reporting-remote`)

Crash reports with scrubbed stack traces. HMAC-signed POST.

### Vault Integration (`vault-integration`)

HashiCorp Vault KV v2 and AWS Secrets Manager as secret providers.

### Scheduled Backups (`scheduled-backups`)

Cron-based backups to S3, R2, GCS, or Azure Blob Storage.

### LLM Sprint Narrative (`report-llm-narration`)

AI-generated sprint retrospective narrative using inference sidecar.

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

Every feature ships on all three surfaces:

1. **Web** — SvelteKit app at `localhost:5173`
2. **CLI** — `fulcrum <command> [--json]`
3. **TUI** — `fulcrum tui` — full terminal UI with 44 screens
