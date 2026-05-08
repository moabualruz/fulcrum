# Fulcrum

> Local-first Agent OS — project management, agent orchestration, docs, memory, and developer tooling in one platform. Runs entirely on your machine with PGlite. SaaS-ready schema from day one.

Fulcrum is a full-stack Agent OS that combines Jira-style task management, Confluence-style docs, agent orchestration (Symphony), inference sidecar, memory/context engine, search, notifications, and developer tooling (CLI + TUI + Web) into a single local-first platform.

## What Ships in v0.2.0

| Pillar | What it does | Surfaces |
|--------|-------------|----------|
| **Foundation** (P1) | Auth, orgs, feature flags, schema, migrations | Web, CLI |
| **Inference Sidecar** (P2) | Embedded ML models, Ollama/LM Studio backends, embeddings | CLI, Web |
| **Symphony Orchestration** (P3) | Agent dispatch, run lifecycle, retry/stall recovery | Web, CLI, TUI |
| **Sandcastle Runner** (P4) | Sandboxed agent execution, transcript capture, artifact harvest | CLI |
| **Router & Skills** (P5) | Routing rules engine, skill marketplace, auto-assign | Web, CLI, TUI |
| **Tasks & Scrum** (P6) | Kanban boards, sprints, burndown charts, custom fields | Web, CLI, TUI |
| **Docs & Collab** (P7) | TipTap editor, versioning, comments, templates | Web, CLI, TUI |
| **Memory & Context** (P8) | Heuristic extraction, BM25 retrieval, context assembly | CLI, Web |
| **Repos & Git** (P9) | Repository supervision, file browser, commit log | Web, CLI, TUI |
| **Artifacts** (P10) | Run artifact storage, dedup, lifecycle management | Web, CLI |
| **Search** (P11) | Full-text search, facets, saved searches, click telemetry | Web, CLI, TUI |
| **Notifications** (P12) | Rules engine, inbox, audit log, quiet hours, webhooks | Web, CLI, TUI |
| **API & Webhooks** (P13) | REST API (Hono/OpenAPI), webhook dispatcher, connectors | API, Web |
| **CLI Codegen** (P14) | Generated commands, completions, doctor orchestrator | CLI |
| **TUI** (P15) | Full terminal UI with 44 screens, keyboard navigation | TUI |
| **Web Shell** (P16) | SvelteKit app, dashboard, all settings pages, a11y | Web |
| **Cross-Cutting** (P17) | Themes, backups, imports/exports, telemetry, secrets | Web, CLI, TUI |

All online features are **shipped but disabled by default** behind `FULCRUM_FEATURES` flags.

## Quick Start

```bash
# Install
git clone https://github.com/moabualruz/fulcrum
cd fulcrum
bun install

# Run the web app (local dev — no auth required)
bun --cwd apps/web run dev
# → http://localhost:5173

# Or use the CLI
bun run apps/cli/src/main.ts doctor
bun run apps/cli/src/main.ts projects list --json
bun run apps/cli/src/main.ts work create --project <project-id> --title "My first task" --json
```

## Supported Agents

Fulcrum manages configuration for 5 CLI coding agents:

| Agent | Rules | Skills | Hooks | MCP |
|---|---|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | `fulcrum@fulcrum` plugin | `~/.claude/settings.json` | `claude mcp` |
| Codex CLI | `~/.codex/AGENTS.md` | `.codex/skills/fulcrum/` | `~/.codex/hooks.json` | `~/.codex/config.toml` |
| Gemini CLI | `~/AGENTS.md` | `fulcrum-skills` extension | `~/.gemini/settings.json` | `settings.json` |
| OpenCode | `~/.config/opencode/AGENTS.md` | `~/.config/opencode/skills/` | TypeScript plugin | `opencode.json` |
| Pi CLI | `~/.pi/agent/AGENTS.md` | `~/.pi/agent/skills/` | TypeScript extension | `pi-mcp-adapter` |

## Architecture

Runtime surfaces are first-class local apps:

| Path | Role |
|---|---|
| `apps/web` | SvelteKit client and local web UI. `fulcrum web` serves its built output locally. |
| `apps/cli` | Bun CLI app and `fulcrum` binary entrypoint. |
| `apps/tui` | OpenTUI client. Runs in-process against local application callers. |
| `apps/server` | Local server adapters: Hono REST API, tRPC router, routing engine, Yjs/runtime adapters. |
| `src/application` | Business workflows, DTOs, validation, command/query services. Interfaces call here. |
| `src/db` | ORM entities, repositories, migrations, DB composition. |
| `src/domain` | Domain enums/value types and pure domain helpers. |
| `tests` | Cross-interface, e2e, integration, migration, and parity tests. |

Root `package.json` declares `apps/*` as the Bun workspace set. Clients stay local-first: CLI and TUI use in-process callers by default; web runs through local SvelteKit dev or `fulcrum web`; server code provides local REST/tRPC/Yjs adapters without requiring a remote service.

```
┌─────────────────────────────────────────────────────┐
│                    Surfaces                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐│
│  │   Web   │  │   CLI   │  │   TUI   │  │  API   ││
│  │SvelteKit│  │  Bun    │  │ OpenTUI │  │  Hono  ││
│  └────┬────┘  └────┬────┘  └────┬────┘  └───┬────┘│
│       └────────────┼───────────┼─────────────┘      │
│                    │           │                     │
│              ┌─────┴───────────┴─────┐              │
│              │     tRPC Router       │              │
│              │  (shared procedures)  │              │
│              └───────────┬───────────┘              │
│                          │                          │
│  ┌───────────────────────┼───────────────────────┐  │
│  │              Product Kernel                    │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │  │
│  │  │ Tasks  │ │  Docs  │ │ Memory │ │ Search │ │  │
│  │  │Sprints │ │TipTap  │ │Context │ │  FTS   │ │  │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │  │
│  │  │ Repos  │ │Artifact│ │ Events │ │ Notify │ │  │
│  │  │  Git   │ │Storage │ │ Audit  │ │  Feed  │ │  │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ │  │
│  └───────────────────────┬───────────────────────┘  │
│                          │                          │
│              ┌───────────┴───────────┐              │
│              │   PGlite (embedded)   │              │
│              │   Local-first DB      │              │
│              └───────────────────────┘              │
└─────────────────────────────────────────────────────┘
```

## Feature Flags

Online features are gated behind `FULCRUM_FEATURES` (comma-separated):

```bash
# Enable specific features
export FULCRUM_FEATURES=i18n,embeddings,experiments

# All available flags
i18n, embeddings, router-llm, casbin, desktop-app, saas-auth,
experiments, pwa-offline, real-time-collab-server, public-api,
export-csv, import-csv, import-linear, import-jira, import-plane,
telemetry-remote, error-reporting-remote, vault-integration,
scheduled-backups, skill-marketplace, keyring-macos, keyring-linux,
keyring-windows, report-llm-narration, notify-webhook
```

## CLI Commands

```bash
# Project management
fulcrum projects list|create|delete --json
fulcrum work create --project <project-id> --title <title> --json
fulcrum tasks list|create|update|delete --json
fulcrum sprints list|create|close --json

# Docs
fulcrum docs list|create|update --json

# Search
fulcrum search "query" --json
fulcrum search "query" --all-projects --json
fulcrum search "query" --global --json

# Agent operations
fulcrum agent list|test --json
fulcrum runs list|logs|cancel --json
fulcrum inference status|start|stop --json

# System
fulcrum doctor --json
fulcrum backup --output <path>
fulcrum restore --input <path>
fulcrum flags list|set --json

# Data
fulcrum export --format csv|json --entity tasks
fulcrum import --format csv|linear|jira|plane --json
```

## Web App

The SvelteKit web app runs at `http://localhost:5173` in dev mode.

**No login required in local/dev mode.** Set `FULCRUM_REQUIRE_AUTH=1` for SaaS mode with Better-Auth.

Key pages:
- `/` — Current-scope dashboard with project/task/doc/run metrics
- `/projects` — Project hierarchy, portfolio view, and creation
- `/projects/<id>/board` — Kanban board
- `/docs` — Document browser and TipTap editor
- `/search` — Full-text search with facets
- `/inbox` — Notifications and activity feed
- `/runs` — Agent run history and logs
- `/doctor` — Health dashboard (no auth required)
- `/settings/*` — Theme, flags, secrets, backups, connectors, etc.

## TUI

```bash
fulcrum tui
```

Project-first workbench covering tasks, docs, runs, search, notifications, memory, and reports. Keyboard-driven: `j/k` navigate, `Enter` selects, `q` goes back, `Tab` switches panes. Global or all-project views are explicit modes, not silent defaults.

## Development

```bash
bun install                  # Install deps
bun run --bun tsc --noEmit   # Typecheck
bun run scripts/test-root.ts # Run root tests
bun --cwd apps/web run dev    # Dev server
bun --cwd apps/web run web:e2e # Playwright e2e tests
```

## Docs

- [User Guide](docs/user-guide.md)
- [Developer Guide](docs/developer-guide.md)
- [Test Gaps](docs/TEST-GAPS.md) — documented integration/e2e test coverage gaps
- [Roadmap](.planning/ROADMAP.md) — phase status and blockers
- [AGENTS](AGENTS.md) — project rules for AI agents

## License

See [LICENSE](LICENSE).
