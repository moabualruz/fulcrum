# Fulcrum User Manuals

Hands-on guides for every Fulcrum surface, captured 2026-05-23 against a live
dev stack (NestJS server `:3000`, SvelteKit web `:5173`, TUI via OpenTUI, CLI
binary). Screenshots taken in Microsoft Edge through `playwright-cli`; CLI/TUI
screens hosted in browser via `ttyd`.

| Surface | Manual | Screenshots |
|---|---|---|
| Web (SvelteKit) | [web/README.md](./web/README.md) | `screenshots/web/` |
| CLI (`fulcrum`) | [cli/README.md](./cli/README.md) | `screenshots/cli/` |
| TUI (OpenTUI) | [tui/README.md](./tui/README.md) | `screenshots/tui/` |

## Stack assumed by the manuals

```bash
# NestJS server (port 3000) — public REST + tRPC backend
cd apps/server && bun run src/index.ts

# SvelteKit web (port 5173) — invocation layer, talks to :3000
cd apps/web && bun run dev

# ttyd (port 7681) — terminal in the browser; spawn one per CLI/TUI session
ttyd -W -p 7681 -t titleFixed=fulcrum -t rendererType=dom <command>
```

The web is a pure invocation layer: every load and form action goes through
`/api/v1/*` on the NestJS server. There is no in-process database in the web
process — see `services/work-management/src/interface/http/project-public-api.controller.ts`
and friends for the controllers each route consumes.
