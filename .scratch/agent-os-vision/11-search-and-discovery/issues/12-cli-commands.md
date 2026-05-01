---
Status: ready-for-agent
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [05-fts-query-ranking.md, 06-suggest-and-quick-filter.md, 07-saved-searches.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q27, Q-cli-shape, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# CLI search commands: fulcrum search + suggest + saved + cmdk --json everywhere

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-23, T11-24, T11-25, T11-26)

## What to build
Full CLI surface for search via tRPC codegen (Q-cli-shape). Commands: `fulcrum search <query> [--kind] [--project] [--status] [--assignee] [--tag] [--date-range] [--author] [--limit] [--offset] [--json]`; `fulcrum search suggest <partial> [--kind] [--json]`; `fulcrum search saved list [--project] [--json]`; `fulcrum search saved create --name <name> --query-json <json>`; `fulcrum search saved delete <id>`; `fulcrum cmdk <command-name> [--args <json>]` (dispatch palette command from shell). All commands output machine-parseable JSON when `--json` specified.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: codegen (or thin wrappers) connecting CLI flags to tRPC procedure params; Zod validation errors surface as CLI error messages.
- [ ] Web surface: N/A.
- [ ] CLI command: `fulcrum search "foo bar" --kind task --json` returns `{ results: SearchResult[], total: N }`; `fulcrum search suggest "foo" --json` returns `{ suggestions: [...] }`; `fulcrum search saved create --name x --query-json '...'` creates and returns saved view; `fulcrum cmdk create-task` dispatches task creation (headless: prints created task ID); all `--help` flags work.
- [ ] TUI screen: N/A.
- [ ] Tests: each CLI command unit-tested with mock tRPC client; `--json` schema validated against Zod; `--kind` filter respected; unknown `--kind` → validation error; `fulcrum cmdk unknown-cmd` → error; RED→GREEN.

## Blocked by
- `05-fts-query-ranking.md` — `search.query`.
- `06-suggest-and-quick-filter.md` — `search.suggest`.
- `07-saved-searches.md` — `search.saved*`.

## Notes / Tech-stack hints
- `fulcrum cmdk` in headless mode: no TTY palette; instead dispatch command handler directly and return JSON result (e.g. `create-task` → calls `tasks.create`, returns task JSON).
- `--assignee me` resolved by CLI via `ctx.userId` from session token.
- `--date-range` format: `<ISO>/<ISO>` (RFC 3339 interval syntax).
