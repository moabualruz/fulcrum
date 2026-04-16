---
date: 2026-04-16
topic: install-tui-dashboard
---

# Fulcrum: Install Path · Cockpit TUI · Web Monitor / PM Dashboard

## Problem Frame

Fulcrum has strong domain capabilities (tasks, memory, policy, teams, workflows, worktrees) but three critical experience gaps prevent operators from realizing that value:

1. **Installation is not zero-friction.** The current path requires cloning a 12-package monorepo, running a 3-minute native build, executing multiple setup commands, and manually restarting Claude. New users abandon before seeing any value. Context7's reference UX: `npx context7-mcp`, one JSON line, immediate use.

2. **Operators have no live visibility.** The HTTP monitor (port 4721) returns raw JSON. There is no terminal dashboard, no web UI, and no human-readable event feed. A team running 5+ parallel agents cannot tell what is blocked, running, or complete without multiple `curl | jq` commands.

3. **The system is not self-healing.** When setup breaks, the user must read docs and execute manual recovery steps. `fulcrum doctor` diagnoses but does not fix. Plugin discovery exists but is never activated (GAP-PLUGIN-1). Cursor and Windsurf users have zero integration path.

These three gaps form a funnel: users who can't install don't try; users who install but can't observe don't trust; users who can't fix problems when they break don't stay.

---

## Requirements

**A. Zero-Friction Installation**

- R1. `npx fulcrum-mcp init` (alias: `npm exec fulcrum-mcp@latest init`) installs Fulcrum globally in under 30 seconds on a machine with Node.js ≥ 20. No repo clone, no pnpm, no manual native build steps.
- R2. The init command detects which agent runtimes are present via filesystem and `PATH` probes (Claude Code: `~/.claude/` directory; Gemini CLI: `~/.gemini/` directory or `gemini` in PATH; Cursor: `.cursor/` in home or CWD; Windsurf: `.windsurf/` in home or CWD; PI: `pi` in PATH) and configures only those detected.
- R3. For each detected agent, the init command writes the complete, correct configuration: MCP server entry, hook snippet (where supported), context/rules file, and agent-specific extension manifest — with no required user decisions.
- R4. The init command is idempotent: re-running on an already-configured machine produces no destructive changes and exits cleanly.
- R5. After configuring each agent, the init command runs `fulcrum doctor` as a gate and prints a clear summary: which agents were configured, which steps succeeded, and what the user should do next (e.g., "Restart Claude Code to load the MCP server").
- R6. The native kuzu (L2 memory) build is not triggered during init. L2 is opt-in via `fulcrum memory accelerate` as a separate step.
- R7. `fulcrum hook auto` becomes a unified hook entry point: it detects the calling runtime from the stdin event shape and dispatches to the correct per-runtime handler. Operators write one hook command that works across all runtimes.

**B. Cursor and Windsurf First-Class Support**

- R8. `fulcrum init --cursor` writes `.cursor/mcp.json` (MCP server entry) and `.cursor/rules/fulcrum.mdc` (always-applied Fulcrum context block with `alwaysApply: true` frontmatter). Content equivalent to the CLAUDE.md section: workspace context, lifecycle protocol, available tools.
- R9. `fulcrum init --windsurf` writes the equivalent files for Windsurf's rules directory.
- R10. Both commands are also triggered automatically by `npx fulcrum-mcp init` when the respective directories are detected.
- R11. Documentation clearly states that hook-based features (passive trace harvesting, pre-fetch injection, policy enforcement at tool time) are not available for Cursor/Windsurf; only MCP tools and always-applied rules are available.

**C. Self-Healing Doctor**

- R12. `fulcrum doctor --fix` auto-applies remediations for every FAIL and WARN that has a known, safe fix: recreate missing binary symlink; merge missing hook snippet; emit missing CLAUDE.md / GEMINI.md from template; mark expired agent runs as `timed_out`; run pending migrations.
- R13. Each doctor check exposes a `fix?()` function. `--fix` calls all available fix functions after the diagnosis run, reports what was applied, and re-runs the diagnosis to confirm.
- R14. `fulcrum doctor --fix --dry-run` shows what would be applied without making changes.
- R15. Any fix that modifies shared config files (e.g., `~/.claude.json`, `~/.claude/settings.json`) prints a confirmation line describing the change made.

**D. Event Bus → SSE Bridge (Real-Time Foundation)**

- R16. The SSE endpoint at `GET /events/stream` delivers events to connected clients within 50ms of the domain event firing (replacing the current 500ms–2s poll loop).
- R17. The implementation subscribes the in-process `FulcrumEventBus` (`getEventBus().onAny()`) to the SSE writer set. The `setInterval` poll loop is removed from `packages/monitor/src/server.ts`.
- R18. `Last-Event-ID` resume behavior is preserved: on reconnect, the monitor replays events from the DB starting after the provided ID before switching to live push.
- R19. The monitor server must run in the same process as `@moabualruz/fulcrum-core` (already true for `fulcrum serve all`) for the event bus bridge to function.

**E. Cockpit TUI (`fulcrum tui`)**

- R20. `fulcrum tui` opens a live terminal dashboard that renders: (a) task board pane (Kanban columns: backlog / active / blocked / done with task titles, assigned role, age); (b) agent runs pane (last 15 runs: status indicator, role, heartbeat lag, task title); (c) event stream pane (live tail of `/events/stream` rendered as human-readable lines: `[HH:mm:ss] <role> <verb> <noun> — <detail>`); (d) policy pane (recent violations and blocked runs with blocker reason); (e) header bar (workspace name, active run count, last event timestamp).
- R21. The TUI updates in real time via the SSE event stream. No polling.
- R22. Keyboard navigation: `tab` to cycle panes, arrow keys to move within a pane, `enter` to select an item, `q` to quit. Item selection shows a detail view (task description, run log, memory content, event payload).
- R23. Keyboard actions on selected items: `u` on a blocked run → POST `/runs/:id/unblock`; `k` on a running run → POST `/runs/:id/kill`; `n` from the task pane → opens an inline form to create a task; `d` on a task → mark done.
- R24. The TUI reads from `http://localhost:4721` (same Hono server). When the monitor is not running, it falls back to direct SQLite read via `@moabualruz/fulcrum-core`'s `getDb()` in read-only mode (no keyboard actions that require the monitor).
- R25. The TUI is implemented in `packages/cli/src/tui/` using the Ink library (React for terminals). It is invoked as `fulcrum tui` via the existing CLI routing.
- R26. The TUI starts in under 2 seconds on a machine with an active monitor server.

**F. Web Monitor as Control Room**

- R27. The HTTP monitor at port 4721 serves a minimal web UI at `GET /` — a single static HTML file with vanilla JS and CSS, no build step, no framework. The UI renders: board summary, active agents table, event log (via browser EventSource), blocked runs panel, and a quick-actions panel.
- R28. The monitor adds mutation HTTP endpoints: `POST /tasks` (create task), `PATCH /tasks/:id` (update status/priority), `POST /runs/:id/unblock`, `POST /runs/:id/kill`, `POST /reviews/:id/approve`, `POST /reviews/:id/reject`. All endpoints proxy to the corresponding ToolRegistry handler.
- R29. Mutation endpoints require a bearer token when `FULCRUM_MONITOR_TOKEN` is set. When the env var is absent, the server operates in development mode (localhost-only, no auth required). The web UI reads the token from `localStorage` and sends it in the `Authorization` header.
- R30. The web UI's event log section uses the browser's native `EventSource` API to connect to `/events/stream` and renders each event as a colored, human-readable line (same format as `fulcrum log`).
- R31. The web UI is a single file served from `packages/monitor/src/public/index.html`. No bundler required.

**G. Human Notification on Block + `fulcrum log`**

- R32. When `block_agent_run` is called, Fulcrum triggers a best-effort notification: (a) desktop notification via a cross-platform mechanism (macOS: `osascript` or `terminal-notifier`; Linux: `notify-send`; Windows: `powershell toast`); (b) append to `~/.local/share/fulcrum/alerts.log` with ISO timestamp, run_id, role, and escalation_reason; (c) if `FULCRUM_ALERT_WEBHOOK` env var is set, POST a Slack-compatible JSON payload (fire-and-forget, no retry).
- R33. Notification failure is non-fatal. The `blockAgentRun()` call succeeds even if all notification channels fail. Errors are logged to stderr only.
- R34. `fulcrum log` is a new CLI subcommand that renders agent activity as a human-readable feed: task starts, run lifecycle events, blocked runs, completed runs, policy violations. Each line: `[HH:mm:ss] <role> <verb> <noun> — <detail>`.
- R35. `fulcrum log --follow` tails the live SSE stream. `fulcrum log --run-id <id>` filters to one run. `fulcrum log --since <duration>` (e.g., `1h`, `30m`) filters by time. Without flags, shows the last 50 events.
- R36. `fulcrum log` reads from the monitor SSE stream when running; falls back to querying the `events` and `hook_events` tables directly via `getDb()`.

**H. GAP-PLUGIN-1: Live Plugin Activation**

- R37. `discoverPlugins()` from `packages/cli/src/plugin-discovery.ts` is called at `runServeMcp()` startup (and at `fulcrum serve all` startup). The result is passed to `createFulcrumMcpServer()` as `additionalTools` and `middleware`.
- R38. Plugin discovery scans both the workspace-local `node_modules/` and the global plugin directory (`globalDataDir()/plugins/`) for packages with `"fulcrum": { "type": "plugin" }` in their manifest (GAP-PLUGIN-5 fix included).
- R39. `fulcrum plugin add <npm-package>` installs the named package into `globalDataDir()/plugins/` and confirms it will be loaded on next MCP server restart.
- R40. `fulcrum plugin list` shows currently discovered plugins (name, version, hooks, skills, agents contributed).

---

## Success Criteria

- A developer with Claude Code installed can go from `npx fulcrum-mcp init` to a working MCP server in Claude Code in under 2 minutes, with no manual file edits.
- `fulcrum tui` opens in a terminal, shows live task board and agent runs, and keyboard-driven unblock of a blocked run triggers the state change within 500ms.
- The web monitor at `http://localhost:4721` shows a human-readable page (not raw JSON) with live event feed, and POST actions (create task, unblock run) succeed from the browser.
- SSE events arrive in the browser and TUI within 50ms of the domain event firing.
- `fulcrum doctor --fix` applied to a machine with a missing hook snippet repairs the issue and re-runs doctor cleanly.
- A Cursor user running `fulcrum init --cursor` gets `.cursor/mcp.json` and `.cursor/rules/fulcrum.mdc` with correct content and can call `fulcrum` MCP tools from Cursor sessions.
- A blocked agent run triggers a desktop notification within 1 second.
- A plugin npm package with `"fulcrum": { "type": "plugin" }` in its manifest is automatically registered when `fulcrum serve mcp` starts.

---

## Scope Boundaries

- **No SPA build toolchain.** The web UI is a single static HTML file. No React, Vue, webpack, Vite, or esbuild for the monitor UI.
- **No OAuth for the monitor.** Auth is bearer token only (`FULCRUM_MONITOR_TOKEN`). Single-user, local-first assumption.
- **No agent-defined custom TUI panels.** Per-agent UI widgets are a v2 feature. The TUI layout is fixed for this release.
- **No Codex support.** Codex has no plugin system. It is not a target for this work.
- **No multicast A2A federation.** Cross-workspace agent discovery via LAN multicast is out of scope.
- **No P2P sync fabric.** The sync package's Fulcrum-to-Fulcrum peer replication is deferred.
- **Windsurf is best-effort.** Windsurf's rules format is documented as similar to Cursor's; if it diverges, Cursor takes priority.
- **Notification is fire-and-forget.** No delivery guarantees, no retry, no acknowledgment. Alerts log is the reliable fallback.
- **Plugin sandboxing is deferred.** Plugins run in-process. Security model: install only trusted plugins.

---

## Key Decisions

- **Ink v4 for TUI** (not Blessed or terminal-kit): React model, TypeScript-native, SSR to terminal — same mental model as React without browser. Active maintenance as of 2026.
- **Vanilla HTML/CSS/JS for web UI** (not React or Svelte): avoids build toolchain; `EventSource` is native to browsers; the monitor is a local dev tool, not a production web app.
- **Event bus bridge replaces SSE poll loop**: The monitor must run in-process with `@moabualruz/fulcrum-core` for real-time push. This is already true for `fulcrum serve all` (both start in the same Node process). Subprocess monitor mode (when monitor is a child process of MCP server) does not get real-time push — it continues to use DB poll with a reduced 500ms interval.
- **`fulcrum hook auto` unified entry point**: Auto-detect from event shape (non-overlapping field sets: Claude has `tool_name`+`session_id`, Gemini has `toolName`+`conversationId`, PI has `role`+`runId`). This collapses the three siloed hook commands into one.
- **`node-notifier` for desktop notifications**: Cross-platform; gracefully returns on unsupported systems. Alternative (`@napi-rs/notify`) is more ergonomic but adds a native build dependency — rejected.
- **Bearer token auth for mutation endpoints**: Simple, stateless, and sufficient for a local-only control plane. No session cookies, no CSRF concerns.

---

## Dependencies / Assumptions

- The monitor server runs in the same process as `@moabualruz/fulcrum-core` when `fulcrum serve all` is used. This is a prerequisite for R16–R19 (event bus bridge). The requirement is already met by the current architecture.
- `packages/monitor/src/server.ts` has `app.post('/policy/check')` as proof that Hono is wired for writes — all mutation endpoints (R28) follow this established pattern.
- R1–R7 (init command) require the `fulcrum-mcp` package to be published to npm. The package already exists in the monorepo; publishing is a prerequisite.
- R37–R40 (plugin activation) depend on `plugin-discovery.ts` already being fully implemented and correct — verified against the codebase; only the call site is missing.

---

## Outstanding Questions

### Resolve Before Planning
_(none — all product decisions resolved)_

### Deferred to Planning

- [Affects R1][Needs research] Which npm package name should `npx fulcrum-mcp init` resolve to? Is `fulcrum-mcp` already published, or does it need a first publish?
- [Affects R20–R25][Technical] What Ink version is appropriate given Node 20+? Confirm EventSource polyfill strategy for the TUI (undici's EventSource vs. `eventsource` npm package).
- [Affects R27, R31][Technical] Confirm Hono's built-in static file middleware (`serveStatic`) works with a bundled HTML file in `packages/monitor/src/public/` — verify in server.ts patterns.
- [Affects R32][Technical] Confirm `osascript` availability on macOS (should be universal); verify `notify-send` package name on major Linux distros (libnotify-bin on Debian/Ubuntu, libnotify on Arch).
- [Affects R12][Technical] Verify that `doctor.ts` `CheckResult` type has or can be extended with a `fix?()` field without breaking existing doctor consumers.

## Next Steps

`-> /ce:plan` for structured implementation planning
