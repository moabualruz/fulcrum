# Fulcrum User Manuals

Live manual-test captures + user guides for every Fulcrum surface, taken
2026-05-23 against a NestJS server (`:3000`) + SvelteKit web (`:5173`) +
OpenTUI process (`:7681` via ttyd). Real data seeded into the NestJS DB so
every list/board/detail surface shows actual rows.

## Audience

This pair of docs is for two readers:
1. **Operators** — people running Fulcrum locally. The 3 surface manuals
   below walk every screen with annotated screenshots + the keyboard /
   click flows that move you between them.
2. **Contributors** — the [findings.md](./findings.md) is the latest
   manual-test bug ledger, including 8 server bugs fixed in this pass
   (slug routing, button variants, CLI help, sprint route order, missing
   tables tolerated, …).

## Map

| Surface | Manual | Screenshots |
|---|---|---|
| **Web** (SvelteKit @ `:5173`) | [web/README.md](./web/README.md) | `screenshots/web/` (40+ canonical surfaces) |
| **CLI** (`fulcrum` binary) | [cli/README.md](./cli/README.md) | `screenshots/cli/` (every subcommand + --help) |
| **TUI** (OpenTUI process) | [tui/README.md](./tui/README.md) | `screenshots/tui/` (launcher + nav + per-screen) |

## Cross-surface parity

The same work-stream is reachable from every surface — pick the one that
fits the moment.

| Workflow | Web | CLI | TUI |
|---|---|---|---|
| Land on a project | `/<ws>/projects/<id>/capture` | `fulcrum init <dir>` | `j/k` → Projects → Enter |
| Inspect health | `/<ws>/projects/<id>/operate/doctor` | `fulcrum doctor` | `g o` (chord) → Doctor |
| List runs | `/runs` | `fulcrum doctor --subsystem runs` | `:runs` |
| Browse skills | `/settings/skills` | `fulcrum skills list` | (settings-screens) |
| Browse MCP | `/<ws>/projects/<id>/operate/mcp` | `fulcrum doctor --subsystem mcp` | `:mcp` |
| Open palette | `⌘K` | n/a | `:` or `Ctrl+K` |

## Stack the manuals assume

```bash
# 1. Backend (NestJS public API + tRPC; port 3000)
cd apps/server && bun run src/index.ts

# 2. Web (invocation layer; port 5173)
cd apps/web && FULCRUM_SERVER_URL=http://localhost:3000 bun run dev

# 3. TUI (OpenTUI; foreground process)
bun run apps/tui/src/index.ts

# Optional: host CLI/TUI in a browser session
brew install ttyd
ttyd -W -p 7681 -t rendererType=dom bash -lc 'fulcrum --help; exec bash'
```

The web is a **pure invocation layer**: every load + form action calls
`/api/v1/*` on the NestJS server. There is no in-process database in the
web process — the architecture guard in `tests/architecture/` enforces
this.

## Data seeded for these screenshots

Via the public API on `local-project`:

- 7 tasks (varied statuses + priorities)
- 1 sprint ("Sprint 1", capacity 40 points)
- 3 docs (ADR, meeting, wiki)
- 3 modules (Capture & Plan, Build & Ship, Operate & Audit)
- 2 intake requests (open + accepted)

Reseed with the snippets in [findings.md](./findings.md). The manuals
reference these by name — replace `local-project` with your own slug.
