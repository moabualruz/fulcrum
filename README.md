<div align="center">

<img src="apps/web/src/lib/assets/fulcrum-logo.svg" width="72" alt="Fulcrum — lever pivot" />

# Fulcrum

**Your repo, your work board, your agents — one local-first Agent OS.**

> *A fulcrum is the pivot point of a lever — the supporting structure that turns small effort into large output. Same idea here: small commits land big outcomes through the agents you supervise.*

Project management + agent orchestration + docs + memory + a CLI/TUI/Web triad,
all running on your machine. PGlite by default; swap in Postgres with one env
var. SaaS-ready schema from day one. Online features ship but stay dark behind
explicit feature flags until you opt in.

[![Status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#status)
[![Local-first](https://img.shields.io/badge/local--first-pglite-blue.svg)](#getting-started)
[![Surfaces](https://img.shields.io/badge/surfaces-web%20%7C%20cli%20%7C%20tui-purple.svg)](#three-surfaces-one-brain)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Built with Bun](https://img.shields.io/badge/runtime-bun-black.svg)](https://bun.sh)

[Quick Start](#quick-start) · [Three Surfaces](#three-surfaces-one-brain) · [How it Works](#how-it-works) · [User Manuals](docs/manuals/) · [Acknowledgements](#acknowledgements)

</div>

---

## Why Fulcrum

Coding agents are everywhere; the **work around them** is fragmented. Tickets in
Jira, docs in Notion, runs in a sandbox no one watches, memory in a markdown
file someone forgot to commit. Fulcrum collapses that into one process you
control:

- **Local-first by default** — your project, your DB, your machine. No telemetry leaves the box unless you flip a flag.
- **Three surfaces, one model** — Web, CLI, TUI all hit the same NestJS public API. Whatever you do in one is real in the others, immediately.
- **Sandbox-first agent runs** — agents run inside isolated worktrees + container images, not your dev shell. Powered by [Matt Pocock's Sandcastle](https://github.com/mattpocock/sandcastle).
- **OpenAI Symphony-compatible** — `fulcrum doctor` validates conformance to the [openai/symphony](https://github.com/openai/symphony) orchestration spec; the work-board → run lifecycle implements its contract.
- **No vendor lock-in** — PGlite for dev, Postgres for prod via `FULCRUM_DATABASE_URL`. Same schema both ways.

---

## Quick Start

```bash
# 1. clone + install
git clone https://github.com/moabualruz/fulcrum
cd fulcrum
bun install

# 2. spin the stack (3 processes)
cd apps/server && bun run src/index.ts &                              # NestJS public API @ :3000
cd apps/web    && FULCRUM_SERVER_URL=http://localhost:3000 bun run dev # SvelteKit web  @ :5173
bun run apps/tui/src/index.ts                                          # OpenTUI terminal

# 3. install the CLI globally (one binary)
bun run build && cp dist/fulcrum-darwin-arm64 ~/.local/bin/fulcrum
fulcrum doctor   # confirms the stack is wired
```

Open <http://localhost:5173/>, pick your project, ship work.

---

## Three Surfaces, One Brain

The same NestJS server backs every surface. The web is a **pure invocation
layer** — it never opens a database — and the TUI / CLI hit the same `/api/v1/*`
endpoints. Whatever a human can do, an agent can do.

<table>
  <tr>
    <td width="33%" align="center"><b>Web</b><br/><sub>SvelteKit · :5173</sub></td>
    <td width="33%" align="center"><b>CLI</b><br/><sub>Bun-compiled · one binary</sub></td>
    <td width="33%" align="center"><b>TUI</b><br/><sub>OpenTUI · keyboard-first</sub></td>
  </tr>
  <tr>
    <td><img src="docs/manuals/screenshots/web/72-proj-backlog.png" alt="Web backlog with sprint planning"/></td>
    <td><img src="docs/manuals/screenshots/cli/03-doctor.png" alt="fulcrum doctor"/></td>
    <td><img src="docs/manuals/screenshots/tui/08-doctor-screen.png" alt="TUI Doctor screen"/></td>
  </tr>
</table>

The Operate stage is identical across surfaces — same doctor, same MCP
inventory, same plugin registry:

![Operate stage in the web app](docs/manuals/screenshots/web/06-operate.png)

Full per-surface guides + every screen captured against live data live in
[`docs/manuals/`](docs/manuals/).

---

## Tasks, Boards, and the Build Graph

The work spine — what your team is doing, who's doing it, and what's blocked.

### Workspace kanban — `/boards`

Five-column board over canonical statuses (`pending`, `in_progress`, `blocked`, `completed`, `cancelled`) with every task in the workspace. Tabs swap into List, Table, Gantt, or Calendar views without leaving the page. New tasks are created inline per column.

![Workspace boards across 5 columns](docs/manuals/screenshots/web/02-boards.png)

### Project board — `/projects/<slug>/board`

Same kanban, scoped to one project. The "manual task workbench" header summarizes Backlog / Unstarted / Started / Completed / Canceled so a PM can read status at a glance before drilling into cards.

![Per-project board with manual workbench summary](docs/manuals/screenshots/web/71-proj-board.png)

### Build dependency graph — `/build-graph`

Sugiyama-layered DAG of the running build. Nodes color-code by lifecycle (queued, running, awaiting, blocked, completed), edges curve along the running chain, and the selected node opens an info card with `Open run` + `Open task` actions.

![Build dependency graph with selected node panel](docs/manuals/screenshots/web/03-build-graph.png)

The same data drives the CLI (`fulcrum tasks list --json`, `fulcrum runs graph --json`) and the TUI (`Build · Graph` chord), so a human and an agent see identical state.

---

## Plan → Review → Ship

Every stage shares the same vocabulary (status badges, ModeRow per step, trace badge in the topbar) so the UI tells the same story across the workflow:

### Plan — `/planning`

The Plan stage owns AI Assist sessions, traffic streams, and the persistent planning workspace. Sessions list left, planning workspace centre, source-doc + trace-summary on the right.

![Plan stage with active AI Assist session and traffic stream](docs/manuals/screenshots/web/02-plan.png)

### Review — `/review`

Code, QA, E2E, and Final QA review queues with diff + comments tripane.

![Review stage tripane](docs/manuals/screenshots/web/04-review.png)

### Ship — `/ship`

Release cuts, archive timeline, artifact bundle download — same data as `fulcrum ship list --json`.

![Ship stage release list](docs/manuals/screenshots/web/05-ship.png)

### Operate — `/operate`

Doctor system health (subsystems, latency, error rate), MCP inventory, plugins, alerts, telemetry. Mirrors `fulcrum doctor`.

![Operate stage doctor view](docs/manuals/screenshots/web/06-operate.png)

---

## How it Works

```
            ┌─────────────────────────────────────────────────┐
            │             NestJS public API @ :3000           │
            │ /api/v1/*  +  tRPC  +  Swagger  +  agent runs   │
            └─────────────┬───────────────┬───────────────────┘
                          │               │
        ┌─────────────────┴──┐         ┌──┴────────────────────┐
        │ SvelteKit web :5173 │         │  CLI binary  +  TUI   │
        │ (no in-proc DB)    │         │ (HTTP only, no DB)    │
        └─────────────────────┘         └───────────────────────┘
                          │               │
                          ▼               ▼
            ┌──────────────────────────────────────────────────┐
            │   PGlite  ⟷  TypeORM  ⟷  fulcrum_* entity tables  │
            │   (swap to Postgres with FULCRUM_DATABASE_URL)   │
            └──────────────────────────────────────────────────┘
                          │
                          ▼
            ┌──────────────────────────────────────────────────┐
            │ Sandcastle runtime — isolated worktree + sandbox │
            │   (Claude Code, Codex, Gemini, OpenCode, Pi …)   │
            └──────────────────────────────────────────────────┘
```

### What you get out of the box

| Pillar | What it does | Surfaces |
|---|---|---|
| **Foundation** | Auth, orgs, feature flags, migrations | Web · CLI |
| **Symphony orchestration** | Agent dispatch, run lifecycle, retry/stall recovery | Web · CLI · TUI |
| **Sandcastle agent runs** | Sandboxed execution, transcript capture, artifact harvest | CLI · TUI |
| **Inference sidecar** | Embedded models, Ollama / LM Studio backends, embeddings | CLI · Web |
| **Routing & skills** | Rules engine, skill marketplace, auto-assign | Web · CLI · TUI |
| **Tasks & sprints** | Kanban, sprints, burndown, custom fields | Web · CLI · TUI |
| **Docs & collab** | TipTap editor, versioning, comments, templates | Web · TUI |
| **Memory & context** | Heuristic extraction, BM25 retrieval, context assembly | CLI · Web |
| **Repos & git** | Repository supervision, file browser, commit log | Web · CLI · TUI |
| **Artifacts** | Run artifact storage, dedup, lifecycle | Web · CLI |
| **Search** | Full-text search, facets, saved searches | Web · CLI · TUI |
| **Notifications** | Rules engine, inbox, audit log, webhooks | Web · CLI · TUI |
| **Public API** | REST `/api/v1/*` + tRPC, OpenAPI 3.1 schema | API |
| **Cross-cutting** | Themes, backups, imports/exports, telemetry, secrets | Web · CLI · TUI |

All "online" features ship but stay disabled until you opt in via
`FULCRUM_FEATURES=feature-a,feature-b`. The web prod build defaults to off;
local dev defaults `public-api` on so you can drive the stack without flags.

---

## CLI in 10 seconds

```bash
fulcrum init                          # bootstrap a project (AGENTS.md, CLAUDE.md, .gitignore)
fulcrum install --profile minimal     # splice rules + hooks + skills into every detected agent
fulcrum doctor --json | jq            # canonical envelope: pipe into CI
fulcrum hooks list                    # see registered hook recipes
fulcrum skills sync                   # mirror authored skills to every agent
fulcrum compress --check              # CI gate: caveman compression up to date
```

Every subcommand has `--help`. The CLI emits a `fulcrum.cli.v1` JSON envelope
under `--json` for machine consumers.

![fulcrum --help](docs/manuals/screenshots/cli/01-help.png)

---

## Status

- **alpha** — wire-up complete across all 13 service domains; APIs settling.
- 1,500+ tests pass on `dev/v1.0` (typecheck 0, architecture 208/0, ui-kit 90/0, web 1,525/0).
- The web is a verified pure invocation layer — `tests/architecture/` enforces it.
- Active areas: sprint↔task entity unification, TUI screen coverage, additional MCP servers.

See [`docs/manuals/findings.md`](docs/manuals/findings.md) for the most recent
manual-test pass and a transparent ledger of bugs found + fixed + open.

---

## Acknowledgements

Fulcrum stands on shoulders. Two projects in particular were so directly
useful they're hard-coded into the stack:

### 🏰 Sandcastle — by [@mattpocock](https://github.com/mattpocock)

[`@ai-hero/sandcastle`](https://github.com/mattpocock/sandcastle) powers every
agent run in Fulcrum. It hands us:

- Isolated worktree + sandbox per run (Docker / Podman / Vercel / custom).
- Provider abstraction across Claude Code, Codex, Gemini, OpenCode, Pi.
- Branch-strategy management so agents never touch your live tree.

You can see it live in `services/execution-orchestration/infrastructure/agent-runtime/sandbox-runner.ts` — `runAgent` + `resolveProvider` + `sandboxProviderDoctorChecks` are all Sandcastle bindings. The `fulcrum doctor` sandbox check returns Sandcastle's provider availability + trust-boundary warning verbatim. Pin: `@ai-hero/sandcastle@0.5.6` (`tests/execution-orchestration/agent-runtime/sandcastle-deps.test.ts` keeps it locked).

### 📚 Skills — by [@mattpocock](https://github.com/mattpocock)

The [`mattpocock/skills`](https://github.com/mattpocock/skills) repository is
the upstream pattern Fulcrum's `fulcrum skills upstream` mirrors. Authored
skills follow the same `SKILL.md` frontmatter + body shape; the same lint
rules apply. Without Matt's work on what a skill IS, this layer would not
exist.

Thank you, Matt — both gifts are foundational.

### 🎼 Symphony — by [OpenAI](https://github.com/openai/symphony)

Fulcrum implements OpenAI's [Symphony](https://github.com/openai/symphony)
orchestration spec — the work-board → autonomous-run lifecycle, evidence
contracts, retry/stall recovery, PR-landing semantics. `fulcrum doctor
--subsystem symphony` validates conformance.

Thanks to the OpenAI contributors driving Symphony forward — including
[@frantic-openai](https://github.com/frantic-openai),
[@hintz-openai](https://github.com/hintz-openai),
[@danial-openai](https://github.com/danial-openai),
[@kevinw-openai](https://github.com/kevinw-openai), and
[@mstrautmann-oai](https://github.com/mstrautmann-oai). Your spec made
this build dramatically less ambiguous.

### Stack credits

NestJS · SvelteKit · OpenTUI · TypeORM · PGlite · Bun · ui-kit (shadcn-svelte vocabulary, OKLCH tokens) · TipTap · Better-Auth · Effect.

---

## License

[MIT](LICENSE). Use it. Fork it. Ship it.

---

<div align="center">
<sub>Built local-first. Built honest. Built so the agents and the humans both ship.</sub>
</div>
