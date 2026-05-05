# Phase 08 Research: Platform UX Patterns

**Researched:** 2026-05-06  
**Scope:** CLI, TUI, Web, public API parity patterns for surface delivery

## Summary

Phase 08 should treat Fulcrum as one product exposed through four surfaces: Web, CLI, TUI, REST/API. Best competing platforms do not make every surface identical; they expose the same domain capabilities with surface-native ergonomics.

- **CLI pattern:** follow GitHub CLI and Linear-style machine output. Human output defaults to readable summaries; automation uses stable JSON. GitHub CLI documents `--json`, `--jq`, and template output as scripting primitives. Linear CLI ecosystem also exposes command-wide machine-readable output with field selection.
- **TUI pattern:** follow opencode/OpenTUI operational UIs: keyboard-first, live panels, status bars, scrollback/log panes, and immediate feedback for running jobs. OpenTUI is usable but still marked in-development upstream, so Fulcrum needs a renderer-adapter gate before a wholesale rewrite.
- **Web pattern:** preserve existing shadcn-svelte ownership model. Shadcn-svelte components are copied into the app, which fits Fulcrum's need to own UI source instead of black-box component behavior.
- **API pattern:** follow Sentry/Jira/GitHub operational API expectations: OpenAPI spec, bearer/API-key auth, typed errors, pagination, rate-limit headers, and webhook preference over polling.

## Competitive Patterns

| Surface | Platform pattern | Fulcrum decision input |
|---|---|---|
| CLI | GitHub CLI: readable default output; `--json`; `--jq`; templates; shell completions. | `fulcrum <domain> <verb> --json` everywhere; optional `--jq` later only after core parity; completion command now. |
| CLI | Linear CLI ecosystem: output format + fields for agent/script use. | Generated commands should output typed objects/arrays from tRPC schemas, not ad hoc text converted to JSON. |
| TUI | OpenTUI/opencode: full terminal app with renderer loop, keyboard/mouse protocols, scrollback helpers, JSX bindings. | Use OpenTUI adapter with fake terminal tests; preserve in-process tRPC caller; no direct DB imports. |
| Web | Linear/Jira/Plane/Notion operational pages: dense nav, table/board/detail pages, command palette, route-level tests. | Web completion = verify every existing route renders and every Phase 5-7 page is linked, not redesign. |
| API | Sentry: per-identity rate limiting, headers, discourage polling in favor of webhooks. | API-05 must key by caller identity/org/API key and emit rate-limit headers. |
| API | Atlassian/Jira Cloud: 2026 point-based/tiered quota enforcement. | Fulcrum v1 can start fixed-window per org/user/key, but data model should allow tier override later. |

## Exact UX Decisions To Carry Into Context

- CLI names are domain-first and verb-second: `fulcrum tasks list`, `fulcrum docs get`, `fulcrum repos sync`, `fulcrum notify rules list`.
- JSON mode returns tRPC output schema shape directly, with ISO strings for dates at process boundary.
- CLI human mode can summarize, but must never be the source of truth for tests. Tests assert JSON.
- Shell completion command must match `gh completion -s <shell>` shape: `fulcrum completion --shell bash|zsh|fish|powershell`.
- TUI top-level navigation must cover all parity domains: Projects, Tasks, Docs, Memory, Runs, Repos, Artifacts, Search, Notifications, Routing/Skills, Doctor/Settings.
- TUI live run monitor copies GitHub Actions/opencode-style log streaming: left run list, right current log/metadata pane, status footer.
- Web route completion follows existing app structure under `src/web/src/routes/`; Phase 08 should not create landing/marketing pages.
- REST API spec should be at both current `src/api/hono.ts` documented `/openapi.json` inner route and web-mounted `/api/v1/openapi.json`, with tests proving the served path.

## Sources

- GitHub CLI formatting docs: https://cli.github.com/manual/gh_help_formatting
- GitHub CLI reference/completion docs: https://cli.github.com/manual/gh_help_reference
- OpenTUI repository/docs: https://github.com/anomalyco/opentui and https://opentui.com/docs/core-concepts/renderer/
- shadcn-svelte component docs: https://shadcn-svelte.pages.dev/docs/components
- Sentry API rate-limit docs: https://docs.sentry.io/api/ratelimits/
- Atlassian Jira Cloud rate-limit docs: https://developer.atlassian.com/cloud/jira/platform/rate-limiting/
- Linear developers/API docs: https://linear.app/docs/api/
