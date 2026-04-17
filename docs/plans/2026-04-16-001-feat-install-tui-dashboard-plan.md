---
title: "feat: Zero-Friction Install, Cockpit TUI, and PM Dashboard"
type: feat
status: active
date: 2026-04-16
origin: docs/brainstorms/2026-04-16-install-tui-dashboard-requirements.md
---

# feat: Zero-Friction Install, Cockpit TUI, and PM Dashboard

## Overview

Three mutually-reinforcing UX gaps are addressed together: (1) installation is not zero-friction — context7-style `npx fulcrum-mcp init` doesn't exist; (2) operators have no live visibility — no terminal dashboard, no web UI, no human-readable feed; (3) the system is not fully self-healing — `doctor --fix`, Cursor/Windsurf support, and block notification are missing. This plan implements all three in a dependency-ordered phased delivery.

## Problem Frame

Operators who install Fulcrum cannot observe what running agents are doing, cannot fix broken setups without reading docs, and cannot integrate Cursor or Windsurf without manual work. The install path requires cloning a monorepo, a 3-minute native build, and multiple manual steps — compared to context7's `npx` one-liner. The web monitor returns raw JSON with no UI and no write controls. There is no terminal dashboard. See origin document for full problem framing.

## Requirements Trace

- R1–R7: Zero-friction `npx fulcrum-mcp init` with agent auto-detection, idempotent, doctor-gated
- R8–R11: Cursor and Windsurf first-class support via MCP + `.mdc` rules
- R12–R15: `fulcrum doctor --fix` with per-check fix functions, dry-run, CI-safe `--yes`
- R16–R19: Event Bus → SSE Bridge — sub-50ms delivery, Last-Event-ID resume preserved
- R20–R26: `fulcrum tui` — Ink v4 terminal dashboard, real-time, keyboard controls, write actions
- R27–R31: Monitor write endpoints (`POST /tasks`, `/runs/:id/unblock`, etc.) + static web UI at `GET /`
- R32–R36: Block notification (desktop/webhook/alerts.log) + `fulcrum log` CLI command
- R37–R40: Plugin MCP tool contribution path (`additionalTools` from `discoverPlugins()` → `runFulcrumMcpServer()`)

## Scope Boundaries

- No SPA build toolchain — web UI is a single static HTML file, vanilla JS/CSS
- No OAuth — bearer token only (`FULCRUM_MONITOR_TOKEN`)
- No agent-defined custom TUI panels — fixed layout in v1
- No Codex support — no plugin system in Codex
- No LAN multicast A2A federation
- No P2P Fulcrum sync fabric
- Windsurf is best-effort (same format as Cursor; treat divergence as a Cursor-priority issue)
- Notification is fire-and-forget — no delivery guarantee beyond alerts.log

### Deferred to Separate Tasks

- Sandboxed plugin execution (separate security hardening task)
- `npx fulcrum-mcp` publish pipeline to npm registry (separate devops task — package already exists, just needs CI publish)
- Agent-defined custom TUI panels (v2)

## Context & Research

### Relevant Code and Patterns

**Current state (verified against codebase, 2026-04-16):**

| Feature | Status |
|---------|--------|
| `discoverPlugins()` wired in `main()` | ✅ Done — hook modules load |
| `additionalTools` from plugins → MCP server | ❌ Not done — `runServeMcp()` doesn't pass them |
| `fulcrum plugin list/install` commands | ✅ Done |
| `fulcrum tui` | ❌ Missing |
| `fulcrum log` | ❌ Missing |
| `fulcrum hook auto` | ❌ Missing |
| Cursor/Windsurf config generation | ❌ Missing — no `agent-integration/cursor/` |
| `fulcrum doctor --fix` | ❌ Missing — `CheckResult` has no `fix?()` |
| Monitor write endpoints | ❌ Missing — only `POST /policy/check` |
| Static web UI at `GET /` | ❌ Missing |
| Event Bus → SSE bridge | ❌ Missing — still polls every 2s |
| Block notification | ❌ Missing — `blockAgentRun()` has no notification side-effect |
| `npx fulcrum-mcp init` subcommand | ❌ Missing — `fulcrum-mcp` only delegates `serve mcp` |

**Key files:**
- `packages/cli/src/index.ts` — CLI dispatch, `runServeMcp()`, `runPlugin()`, `main()`
- `packages/cli/src/hooks.ts` — `normalizeHookEvent()`, `runPreHook()`, `HOOK_WRITE_TOOLS`
- `packages/cli/src/doctor.ts` — `runDoctor()`, `printDoctorResults()`, `CheckResult` type
- `packages/cli/src/plugin-discovery.ts` — `discoverPlugins()`, `registerPlugins()`
- `packages/cli/src/mcp-server.ts` — `createFulcrumMcpServer()`, `McpServerOptions` (has `additionalTools?`)
- `packages/monitor/src/server.ts` — Hono app, SSE at `/events/stream` (2s poll), `app.post('/policy/check')`
- `packages/core/src/event-bus.ts` — `getEventBus()`, `onAny()`, `FulcrumEventBus`
- `packages/core/src/runs.ts` — `blockAgentRun()` — emits `agent_run_blocked` event
- `agent-integration/install.ts` — `step()` helper, per-agent install logic, rollback tracking
- `agent-integration/claude/`, `agent-integration/gemini/`, `agent-integration/pi/`
- `packages/fulcrum-mcp/src/index.ts` — thin wrapper, splices `serve mcp` into argv

**CLI dispatch pattern** (for adding new commands):
```
// In index.ts main() dispatch chain:
if (group === 'tui')  { await runTui();  return }
if (group === 'log')  { await runLog();  return }
// In hook dispatch:
if (command === 'auto') { await runHookAuto(phase); return }
```

**Event bus API:**
```
getEventBus().onAny((event) => { /* event.evt_type, event.payload */ })
```

**`blockAgentRun()` call site** — insert notification after `emitEvent(...)` in `packages/core/src/runs.ts`

**Monitor write pattern** — follow `app.post('/policy/check')` in `packages/monitor/src/server.ts`

**Test patterns:**
- Vitest `describe`/`it`/`expect` in `packages/<pkg>/src/tests/*.test.ts`
- Monitor: `server.fetch(new Request('http://localhost/route'))` (no port binding)
- CLI: test `runDoctor()` etc. by importing from `../index.js` (ESM `.js` extension required)

### Institutional Learnings

- `spliceSection` in `scripts/gen-claude-md.ts` has a bug: appends duplicate markers when END precedes START. Fix it before using it in the `--cursor` init path.
- `fulcrum` binary path in doctor gate must be resolved explicitly (not bare `spawnSync('fulcrum', ...)`) — ENOENT produces empty stdout silently reported as "malformed JSON"
- Set `_monitorStarted = true` in the catch block of monitor auto-start (already done per commit `e645790`), not only in the try block
- `require.resolve` is unavailable in native-ESM packages — use `import.meta.resolve()` + `fileURLToPath()`
- `INSERT OR IGNORE` with unique constraints for seed data — not SELECT-then-INSERT
- Monitor probe result should be cached (10–30s TTL) to avoid 200ms × N penalty per agent session
- Event bus bridge only works in-process — subprocess monitor falls back to DB poll (reduce to 500ms, not eliminate)

## Key Technical Decisions

- **Ink v4 for TUI**: React for terminals, TypeScript-native, SSR to terminal. No blessed/terminal-kit. Add `ink` and `react` as dependencies to `packages/cli`.
- **EventSource polyfill in TUI**: Use undici's `EventSource` (available in Node 18+, no extra package). Import via `import { EventSource } from 'undici'` — undici is already a dependency of Node's built-in fetch.
- **Vanilla HTML/CSS/JS for web UI**: No bundler. One file at `packages/monitor/src/public/index.html`. Browser native `EventSource` for live event feed. Token stored in `localStorage`.
- **Event bus bridge pattern**: Monitor server subscribes `getEventBus().onAny(handler)` at startup. Monitor holds a `Set<ReadableStreamController>` of active SSE connections. Last-Event-ID resume still does a DB query. Bridge only active when monitor is in-process with core.
- **`fulcrum hook auto` detection**: Non-overlapping field probe on parsed stdin JSON — `tool_name`+`session_id` → claude; `toolName`+`conversationId` → gemini; `role`+`runId` → pi.
- **Block notification via `node-notifier`**: Cross-platform desktop notification. Already well-supported on macOS (`osascript`), Linux (`notify-send`), Windows (toast). Non-fatal — notification error never blocks `blockAgentRun()`.
- **Monitor auth**: `FULCRUM_MONITOR_TOKEN` env var. When absent → development mode (localhost-only, no auth). Mutation endpoints check `Authorization: Bearer <token>` header.
- **Plugin `additionalTools` wiring**: Extract discovered plugin tools from `registerPlugins()` result, pass to `runFulcrumMcpServer()` as `additionalTools`. Store discovered tools at module level in `main()` so `runServeMcp()` (called from the dispatch chain after `main()`) can access them.

## Open Questions

### Resolved During Planning

- **Is `discoverPlugins()` already called?** Yes — called in `main()` for hook modules. But plugin-contributed MCP tools are not passed to `runFulcrumMcpServer()` yet.
- **Does `plugin list/install` exist?** Yes — fully implemented in `runPlugin()`.
- **`additionalTools` parameter exists in `createFulcrumMcpServer()`?** Yes — `McpServerOptions.additionalTools?: ToolSchema[]` exists and is already handled at line 207 of `mcp-server.ts`.
- **Event bus API for `onAny`?** Yes — `getEventBus().onAny(handler)` where handler receives the full event object.

### Deferred to Implementation

- **Ink v4 pane layout**: Exact column widths, colors, and box-drawing characters are implementation details — implementer should prioritize readability over aesthetics.
- **`fulcrum log` event-type-to-human mapping**: Full verb mapping for all `evt_type` values in the `events` table — implementer should read the `EventType` union from `packages/core/src/types.ts` and create a mapping table.
- **`npx fulcrum-mcp init` binary resolution inside the npx cache**: Exact path construction for the installed CLI binary when running from the npm cache may need `import.meta.url`-relative resolution — resolve during implementation.
- **Monitor static file serving**: Confirm Hono's `serveStatic` middleware is available in `@hono/node-server` at the installed version — verify `app.use('/', serveStatic({ root: ... }))` works or use `app.get('/', c => c.html(...))` with the HTML string as a fallback.

## Output Structure

```
packages/
  cli/src/
    tui/
      index.tsx          # Ink app entry point — renders all panes
      panes/
        TaskBoard.tsx    # Kanban board pane
        AgentRuns.tsx    # Recent runs pane
        EventStream.tsx  # Live event tail pane
        PolicyPane.tsx   # Violations and blocked runs
      hooks/
        useMonitor.ts    # SSE subscription hook
        useKeyboard.ts   # Keyboard action handler
  monitor/src/
    public/
      index.html         # Single-file web UI

agent-integration/
  cursor/
    mcp.json             # .cursor/mcp.json template
    rules/
      fulcrum.mdc        # .cursor/rules/fulcrum.mdc template
  windsurf/
    rules/
      fulcrum.mdc        # .windsurf/rules/fulcrum.mdc template
```

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Event flow after SSE bridge:**

```
domain event fires (e.g., agent_run_blocked)
  → packages/core/src/events.ts emitEvent()
    → INSERT INTO events table  (DB persistence + Last-Event-ID resume)
    → getEventBus().fire(event) (in-process, synchronous)
      → monitor server onAny handler
        → for each active SSE controller: enqueue("data: {...}\n\n")
          → browser EventSource receives event < 50ms
          → Ink TUI EventSource receives event < 50ms
```

**`fulcrum hook auto` dispatch:**

```
stdin → parse JSON
  has tool_name + session_id → claude handler
  has toolName + conversationId → gemini handler
  has role + runId → pi handler
  none matched → stderr warning, exit 0
```

**`npx fulcrum-mcp init` flow:**

```
detect agents: [claude, gemini, cursor, windsurf, pi]
  for each detected:
    write MCP config entry
    write context/rules file
    write extension manifest (gemini only)
    write hook snippet (claude/gemini/pi only)
install binary symlink (if not already on PATH)
run fulcrum doctor
print summary: configured X agents, doctor: PASS/WARN
prompt: "Restart Claude Code to load the MCP server"
```

---

## Implementation Units

### Phase 1: Foundation

- [ ] **Unit 1: Event Bus → SSE Bridge**

**Goal:** Replace the 2-second poll loop in the monitor's SSE endpoint with a direct in-process event bus subscription, delivering events in under 50ms.

**Requirements:** R16, R17, R18, R19

**Dependencies:** None

**Files:**
- Modify: `packages/monitor/src/server.ts`
- Modify: `packages/monitor/src/types.ts` (add `sseControllers` to `MonitorServer` shape if needed)
- Test: `packages/monitor/src/tests/sse-bridge.test.ts`

**Approach:**
- At monitor startup (inside `startMonitorServer()`), call `getEventBus().onAny(handler)` and store the subscription. The handler encodes the event as `id: <evt_id>\ndata: <json>\n\n` and enqueues it to every controller in a module-level `Set<ReadableStreamDefaultController>`.
- The `/events/stream` route handler creates a `ReadableStream`, adds its controller to the set, and removes it on `abort` signal close.
- Preserve the `Last-Event-ID` resume path: when a client reconnects with `Last-Event-ID`, do a single DB query for events after that ID, stream them, then switch to live push.
- Remove the `setInterval` poll loop from the live-push path. Keep a reduced-frequency poll (500ms) only for the subprocess-monitor case: detect subprocess vs in-process by whether `getEventBus().listenerCount('*') > 0` — or add an explicit `isInProcess: boolean` flag to `MonitorServerConfig`.
- Import `getEventBus` from `fulcrum-core`.

**Patterns to follow:**
- `packages/monitor/src/server.ts` existing `/events/stream` route for SSE framing
- `packages/core/src/event-bus.ts` `onAny()` API

**Test scenarios:**
- Happy path: emit an event via `emitEvent()`, verify it appears in the SSE stream controller within the same tick (no setTimeout needed)
- Happy path: multiple simultaneous SSE connections all receive the same event
- Edge case: controller removed from set when request is aborted — no further enqueue calls
- Edge case: event bus subscription does not block when no SSE clients are connected
- Integration: `Last-Event-ID` reconnect streams DB events then switches to live push — verify ordering is correct
- Error path: event bus handler throws — error is caught, other controllers still receive the event

**Verification:**
- All SSE tests pass. Emitting a domain event synchronously produces a queued SSE chunk in the same tick.
- The `setInterval` poll is removed from the live-push path in `server.ts`.

---

- [ ] **Unit 2: Plugin MCP Tool Contribution**

**Goal:** Plugin-contributed MCP tools (from `additionalTools` in plugin manifests) actually appear in `tools/list` when `fulcrum serve mcp` runs.

**Requirements:** R37, R38, R39 (R40 `plugin list` already done)

**Dependencies:** Unit 1 not required

**Files:**
- Modify: `packages/cli/src/index.ts` — extract `additionalTools` from `registerPlugins()` result and pass to `runFulcrumMcpServer()`
- Modify: `packages/cli/src/plugin-discovery.ts` — ensure `registerPlugins()` returns `{ skills, agents, hookModules, additionalTools }` (add `additionalTools` to return type if not present)
- Test: `packages/cli/src/tests/plugin-mcp-tools.test.ts`

**Approach:**
- In `main()`, after calling `registerPlugins(plugins)`, store `registration.additionalTools` in a module-level variable (e.g., `_pluginAdditionalTools: ToolSchema[]`).
- In `runServeMcp()`, pass `additionalTools: _pluginAdditionalTools` to `runFulcrumMcpServer()`. `McpServerOptions.additionalTools` already exists and is handled.
- In `registerPlugins()`, collect tool schemas from plugin manifests that declare a `tools` path and add them to the return value.
- `fulcrum plugin add <package>` is already implemented as `plugin install` — add `add` as an alias in `runPlugin()`.

**Patterns to follow:**
- `packages/cli/src/mcp-server.ts` line 207 for `additionalTools` concatenation
- `packages/cli/src/plugin-discovery.ts` `FulcrumPluginManifest` type for extending with `tools?: string`

**Test scenarios:**
- Happy path: a fake plugin manifest with a `tools` path contributes a schema that appears in `_pluginAdditionalTools` after `registerPlugins()`
- Happy path: `runFulcrumMcpServer()` receives `additionalTools` and registers them alongside built-in tools
- Edge case: `additionalTools` is empty array when no plugins are discovered — no error
- Edge case: plugin `tools` path does not exist — discovery skips gracefully, logs warning to stderr

**Verification:**
- `fulcrum plugin list` shows discovered plugins. A test plugin with a `tools` export causes its schemas to appear in the tool list returned by the MCP `tools/list` call.

---

### Phase 2: Install & DX

- [ ] **Unit 3: `fulcrum hook auto` Unified Entry Point**

**Goal:** A single `fulcrum hook auto pre` command that auto-detects the calling runtime from the stdin event shape and dispatches to the correct handler. Eliminates per-runtime hook command proliferation.

**Requirements:** R7

**Dependencies:** None

**Files:**
- Modify: `packages/cli/src/hooks.ts` — add `detectHookCli(event)` function
- Modify: `packages/cli/src/index.ts` — add `auto` case to hook dispatch in `runHook()`
- Test: `packages/cli/src/tests/hook-auto.test.ts`

**Approach:**
- `detectHookCli(event: Record<string, unknown>): HookCli | null`:
  - `'tool_name' in event && 'session_id' in event` → `'claude'`
  - `'toolName' in event && 'conversationId' in event` → `'gemini'`
  - `'role' in event && 'runId' in event` → `'pi'`
  - else → `null` (log warning to stderr, exit 0)
- In `runHook()`, when `command === 'auto'`: parse stdin, call `detectHookCli()`, dispatch to the matching handler. If detection fails, write `{ "continue": true }` to stdout and exit 0 (graceful degradation).
- Existing `fulcrum hook claude pre`, `fulcrum hook gemini pre`, etc. remain unchanged for direct use.
- Update usage string in `index.ts`.

**Patterns to follow:**
- `packages/cli/src/hooks.ts` `normalizeHookEvent()` for field access pattern
- `runHook()` dispatch structure in `packages/cli/src/index.ts`

**Test scenarios:**
- Happy path: Claude event (`tool_name` + `session_id`) → detects `'claude'`
- Happy path: Gemini event (`toolName` + `conversationId`) → detects `'gemini'`
- Happy path: PI event (`role` + `runId`) → detects `'pi'`
- Edge case: empty JSON `{}` → returns `null`, exits 0 without writing garbage to stdout
- Edge case: ambiguous event (has both `tool_name` and `toolName`) → prefer claude (first match wins)

**Verification:**
- All three runtime shapes dispatch correctly. Unknown shapes exit 0 cleanly. Existing `hook claude/gemini/pi` commands still work.

---

- [ ] **Unit 4: Cursor and Windsurf Config Generation**

**Goal:** `fulcrum init --cursor` and `fulcrum init --windsurf` write the complete integration files for each platform. Both are also triggered by `npx fulcrum-mcp init` when those directories are detected.

**Requirements:** R8, R9, R10, R11

**Dependencies:** None

**Files:**
- Create: `agent-integration/cursor/mcp.json` — template for `.cursor/mcp.json`
- Create: `agent-integration/cursor/rules/fulcrum.mdc` — template for `.cursor/rules/fulcrum.mdc`
- Create: `agent-integration/windsurf/rules/fulcrum.mdc` — template for `.windsurf/rules/fulcrum.mdc`
- Modify: `packages/cli/src/index.ts` — add `init` group with `--cursor` and `--windsurf` flags
- Modify: `agent-integration/install.ts` — add `installCursor()` and `installWindsurf()` functions
- Test: `packages/cli/src/tests/init-cursor.test.ts`

**Approach:**
- `.cursor/mcp.json` template: `{ "mcpServers": { "fulcrum": { "command": "fulcrum", "args": ["serve", "mcp"] } } }`
- `.cursor/rules/fulcrum.mdc` template: YAML frontmatter `description: "Fulcrum agent OS context"`, `alwaysApply: true`; body = compact Fulcrum context block covering workspace init (auto on first use), available MCP tools summary, lifecycle protocol (start_agent_run → heartbeat → complete/block), and a note that hooks are not available in Cursor.
- Write to `$CWD/.cursor/` (project-local) by default; `--global` flag writes to `$HOME/.cursor/` (user-global).
- Windsurf: identical flow, writing to `.windsurf/rules/` instead.
- `installCursor(opts)` and `installWindsurf(opts)` follow the existing `step()` helper pattern in `install.ts` with rollback entries.
- `fulcrum init --cursor` is a new `init` group added to CLI dispatch.

**Patterns to follow:**
- `agent-integration/claude/CLAUDE.md` and `agent-integration/gemini/GEMINI.md` as content reference
- `agent-integration/install.ts` `step()` helper with rollback tracking

**Test scenarios:**
- Happy path: `fulcrum init --cursor` writes `.cursor/mcp.json` and `.cursor/rules/fulcrum.mdc` with correct content
- Happy path: `--windsurf` writes `.windsurf/rules/fulcrum.mdc`
- Edge case: `.cursor/` directory does not exist → created automatically
- Edge case: re-running is idempotent (files already exist → skip with "already configured" message)
- Error path: no write permission to CWD → step reports FAIL with recovery message

**Verification:**
- Generated `.cursor/mcp.json` is valid JSON. `.cursor/rules/fulcrum.mdc` has valid YAML frontmatter with `alwaysApply: true`. Both files contain the workspace context and MCP server reference.

---

- [ ] **Unit 5: `fulcrum doctor --fix`**

**Goal:** `fulcrum doctor --fix` auto-applies remediations for every FAIL and WARN with a known safe fix. `--dry-run` lists what would be applied.

**Requirements:** R12, R13, R14, R15

**Dependencies:** None

**Files:**
- Modify: `packages/cli/src/doctor.ts` — extend `CheckResult` with `fix?: () => Promise<void>`, add `--fix` and `--dry-run` execution logic
- Modify: `packages/cli/src/index.ts` — parse `--fix` and `--dry-run` flags in doctor dispatch
- Test: `packages/cli/src/tests/doctor-fix.test.ts`

**Approach:**
- Extend `CheckResult` to `{ name, status, message, fix?: () => Promise<void> }`.
- Each existing check function may return a `fix` closure that performs the remediation. Initial fixes: missing binary symlink → recreate; missing hook snippet → merge; missing CLAUDE.md section → emit from template; expired agent runs → mark `timed_out`; pending migrations → `runMigrations(db)`.
- `runDoctor({ fix: boolean, dryRun: boolean })`: collect all results; if `fix && !dryRun`, call each `result.fix()` where present; re-run checks after applying fixes; print final status.
- `--dry-run`: print "Would apply: <fix description>" for each available fix without calling it.
- `--yes`: skip confirmation prompts (for CI). Without `--yes`, fixes that modify shared files (`~/.claude.json`, `~/.claude/settings.json`) print "Applying: <description>" and proceed (no interactive prompt — configuration is deterministic and reversible).
- Fixes that fail are reported as WARN but do not abort remaining fixes.

**Patterns to follow:**
- `packages/cli/src/doctor.ts` existing `runDoctor()` and `printDoctorResults()` structure
- `agent-integration/install.ts` for fix implementations (symlink creation, JSON merge, hook snippet injection)

**Test scenarios:**
- Happy path: `--dry-run` lists available fixes without calling any `fix()` function
- Happy path: `--fix` calls available fix functions and re-runs doctor, producing PASS for previously-FAIL checks
- Happy path: check with no `fix` function is skipped silently in `--fix` mode
- Edge case: fix function throws — WARN is emitted for that check, remaining fixes continue
- Edge case: `--fix --dry-run` together → dry-run takes precedence

**Verification:**
- A check that returns `status: 'fail'` with a `fix` closure transitions to `status: 'pass'` after `--fix` is applied and doctor re-runs.

---

- [ ] **Unit 6: Block Notification + `fulcrum log`**

**Goal:** Blocked agent runs trigger a cross-platform desktop notification, append to alerts.log, and optionally POST to a Slack-compatible webhook. `fulcrum log` renders the event stream as a human-readable activity feed.

**Requirements:** R32, R33, R34, R35, R36

**Dependencies:** Unit 1 (SSE bridge, for `--follow` mode)

**Files:**
- Modify: `packages/core/src/runs.ts` — add notification side-effect after `emitEvent(...)` in `blockAgentRun()`
- Create: `packages/core/src/notify.ts` — `notifyBlocked(run, reason)` — desktop/webhook/log
- Modify: `packages/cli/src/index.ts` — add `log` group dispatch → `runLog()`
- Create: `packages/cli/src/log.ts` — `runLog()` with `--follow`, `--run-id`, `--since` flags
- Test: `packages/core/src/tests/notify.test.ts`
- Test: `packages/cli/src/tests/log.test.ts`

**Approach:**
- `notifyBlocked(run, reason, escalationReason?)`:
  - Desktop: `execSync('osascript -e ...')` on macOS; `spawnSync('notify-send', ...)` on Linux; `powershell.exe` toast on Windows. Detect via `process.platform`. Catch all errors silently (non-fatal).
  - Alerts log: `appendFileSync(join(globalDataDir(), 'alerts.log'), ...)` — ISO timestamp, run_id, role, reason. Always attempted even if desktop notification fails.
  - Webhook: if `FULCRUM_ALERT_WEBHOOK` is set, `fetch(url, { method: 'POST', body: JSON.stringify(slackPayload) })` fire-and-forget (no await, no retry).
- In `blockAgentRun()`: call `notifyBlocked(blockedRun, input.reason, input.escalation_reason)` after the `emitEvent(...)` call. Wrap in `try/catch` — never blocks or throws from `blockAgentRun()`.
- `runLog()`: reads last 50 events from DB by default (query `events` and `hook_events` tables). With `--follow`, connect to `http://localhost:4721/events/stream` via `EventSource` (undici). With `--run-id`, filter to events for that run. With `--since 1h`, compute `Date.now() - 3600000` cutoff. Format: `[HH:mm:ss] <role> <verb> <noun> — <detail>`. Build a `formatEvent(evt)` function mapping each `evt_type` to a human sentence.

**Patterns to follow:**
- `packages/core/src/runs.ts` `blockAgentRun()` for the call site pattern
- `packages/cli/src/index.ts` `runTool()` for the group-dispatch-then-switch pattern
- `packages/monitor/src/server.ts` existing SSE client consumption pattern

**Test scenarios:**
- Happy path (notify): `blockAgentRun()` succeeds even when desktop notification throws an error
- Happy path (notify): alerts.log entry written with correct fields
- Happy path (notify): webhook POST is fired when `FULCRUM_ALERT_WEBHOOK` is set (mock fetch, verify payload is Slack-compatible JSON)
- Happy path (log): last 50 events formatted correctly as `[HH:mm:ss] ...` lines
- Happy path (log): `--run-id` filter returns only events for that run
- Edge case (notify): `FULCRUM_ALERT_WEBHOOK` not set → no fetch call
- Edge case (log): no events in DB → prints "No events found" and exits 0
- Edge case (log): monitor not running with `--follow` → prints "Monitor not running. Start with `fulcrum serve monitor`." and exits 1

**Verification:**
- `blockAgentRun()` tests still pass. alerts.log file is written in the test's `globalDataDir()`. `fulcrum log` output matches `[HH:mm:ss] <role> <verb> <noun> — <detail>` format for each event type.

---

### Phase 3: Observability

- [ ] **Unit 7: Monitor Write Endpoints + Bearer Auth**

**Goal:** Add mutation HTTP endpoints to the monitor: create task, update task, unblock/kill/complete runs, approve/reject reviews. Add bearer token auth for mutation routes.

**Requirements:** R27 (partial — write endpoints), R28, R29

**Dependencies:** None (independent of SSE bridge and TUI)

**Files:**
- Modify: `packages/monitor/src/server.ts` — add `POST /tasks`, `PATCH /tasks/:id`, `POST /runs/:id/unblock`, `POST /runs/:id/kill`, `POST /runs/:id/complete`, `POST /reviews/:id/approve`, `POST /reviews/:id/reject`; add bearer auth middleware
- Modify: `packages/monitor/src/types.ts` — `MonitorServerConfig` to accept `authToken?: string`
- Test: `packages/monitor/src/tests/write-endpoints.test.ts`

**Approach:**
- Auth middleware: Hono middleware that reads `Authorization: Bearer <token>` header on POST/PATCH routes. If `FULCRUM_MONITOR_TOKEN` env var is set, enforce it. If absent (development mode), allow all requests. Middleware is applied only to mutation routes (not GET routes or SSE).
- Each mutation endpoint is a thin proxy to the ToolRegistry: import `TOOL_REGISTRY` from `fulcrum-cli` — wait, circular dep risk. Instead, import the domain function directly: `updateTask()` from `fulcrum-core`, `blockAgentRun()`/`completeAgentRun()` from `fulcrum-core`, `approveReview()` from the appropriate package.
- Request body is parsed via `c.req.json()`. Validate required fields; return `{ error: '...' }` with 400 on validation failure.
- Return `{ data: updatedObject }` on success, following the existing monitor response shape.
- `POST /runs/:id/kill` — sets run status to `aborted` via `terminateAgentRun()` (or equivalent in `packages/core/src/runs.ts`).

**Patterns to follow:**
- `packages/monitor/src/server.ts` `app.post('/policy/check')` for the write route pattern
- Existing `app.get('/tasks')` for the request parameter and response shape pattern

**Test scenarios:**
- Happy path: `POST /tasks` with valid body → task created, `{ data: task }` returned
- Happy path: `PATCH /tasks/:id` with `{ status: 'done' }` → task updated
- Happy path: `POST /runs/:id/unblock` → run status changes from `blocked` to `running`
- Auth: `POST /tasks` with wrong bearer token when `FULCRUM_MONITOR_TOKEN` is set → 401
- Auth: mutation route without token when env var absent → 200 (development mode)
- Auth: GET routes not affected by auth middleware → 200 always
- Error path: `POST /tasks` with missing required `title` → 400 with `{ error: '...' }`
- Error path: `POST /runs/nonexistent/unblock` → 404

**Verification:**
- All write endpoint tests pass. Auth correctly allows/blocks based on env var presence. GET routes unaffected.

---

- [ ] **Unit 8: Static Web UI at `GET /`**

**Goal:** The monitor at `http://localhost:4721` serves a human-readable, SSE-driven web UI with board summary, active agents, event log, blocked runs panel, and quick-action buttons.

**Requirements:** R27, R30, R31

**Dependencies:** Unit 7 (write endpoints for action buttons to target)

**Files:**
- Create: `packages/monitor/src/public/index.html` — single-file web UI
- Modify: `packages/monitor/src/server.ts` — add `GET /` route serving `index.html`

**Approach:**
- `GET /` returns the contents of `index.html` as `text/html`. Use `app.get('/', c => c.html(htmlString))` where the HTML string is imported as a raw asset, OR read it from disk with `readFileSync` at startup. The latter is simpler and avoids build-step complications.
- `index.html` structure:
  - **Header**: workspace name from `/status`, active run count from `/analytics/summary`
  - **Board**: fetch `/board` on load, re-fetch every 30s (board doesn't need SSE granularity)
  - **Active agents table**: fetch `/agents` filtered to running status
  - **Event log**: `new EventSource('/events/stream')` with `workspace_id` query param, appends formatted event lines (same `[HH:mm:ss] role verb noun — detail` format as `fulcrum log`)
  - **Blocked runs panel**: filtered view from `/agents` where `status = 'blocked'`, with an "Unblock" button that `POST /runs/:id/unblock`
  - **Quick actions**: "New Task" button that opens a `<dialog>` form → `POST /tasks`
  - **Auth token input**: `<input type="password">` that writes to `localStorage['fulcrum_token']`, sent as `Authorization: Bearer <token>` on all write calls
- All JavaScript is vanilla, inline in the HTML. No external CDN dependencies (fonts, icons, or framework CDN links are acceptable but optional).
- CSS: minimal, functional — dark background, monospace font, colored status badges.

**Patterns to follow:**
- `packages/monitor/src/server.ts` existing GET route handlers for API calls made from the UI
- `packages/monitor/src/server.ts` `app.post('/policy/check')` for write call patterns

**Test scenarios:**
- Happy path: `GET /` returns 200 with `Content-Type: text/html` and a non-empty body
- Happy path: HTML contains `EventSource` instantiation (string search in response body)
- Happy path: HTML references `/board`, `/agents`, `/analytics/summary` endpoints
- Test expectation: no runtime browser test — the UI is a static file; verify it is served and contains required elements via string inspection

**Verification:**
- `GET /` returns valid HTML. Opening `http://localhost:4721` in a browser shows a functional page with live event log.

---

- [ ] **Unit 9: Cockpit TUI (`fulcrum tui`)**

**Goal:** `fulcrum tui` opens a full-screen terminal dashboard with live agent run board, event stream, and keyboard-driven write actions.

**Requirements:** R20, R21, R22, R23, R24, R25, R26

**Dependencies:** Unit 1 (SSE bridge for real-time updates), Unit 7 (write endpoints for keyboard actions)

**Files:**
- Create: `packages/cli/src/tui/index.tsx` — Ink app root component
- Create: `packages/cli/src/tui/panes/TaskBoard.tsx` — Kanban board pane
- Create: `packages/cli/src/tui/panes/AgentRuns.tsx` — recent runs pane
- Create: `packages/cli/src/tui/panes/EventStream.tsx` — live event tail pane
- Create: `packages/cli/src/tui/panes/PolicyPane.tsx` — violations and blocked runs
- Create: `packages/cli/src/tui/hooks/useMonitor.ts` — SSE subscription, fetch helpers
- Create: `packages/cli/src/tui/hooks/useKeyboard.ts` — keyboard handler
- Modify: `packages/cli/src/index.ts` — add `tui` group dispatch → `runTui()`
- Modify: `packages/cli/package.json` — add `ink` and `react` dependencies
- Test: `packages/cli/src/tests/tui.test.ts` — smoke test for CLI routing

**Approach:**
- `runTui()` in `index.ts`: check if `stdout.isTTY` — if not, print error and exit 1. Import `render` from `ink` dynamically, render the `<App />` component.
- `<App />` root: manages pane focus state, renders `<Header />` + 2×2 pane grid (TaskBoard, AgentRuns, EventStream, PolicyPane).
- `useMonitor()` hook: connects to `http://localhost:4721` via undici `EventSource`. Falls back to direct `getDb()` read when monitor is unreachable. Returns `{ board, runs, events, policy }` state.
- `useKeyboard()` hook: uses Ink's `useInput()` — `tab` cycles focus, arrows move selection, `enter` opens detail view, `u`/`k`/`n`/`d` trigger write actions via `fetch()` to monitor write endpoints.
- Panes receive their slice of state from `useMonitor()` and current focus/selection from parent.
- Event stream pane: maintains a circular buffer of last 100 events. Each event formatted via `formatEvent()` (same function from Unit 6's `log.ts`).
- Header: workspace name and active run count, polled every 10s.
- Fallback mode (no monitor): renders all panes in read-only mode. Write action keys show "Monitor offline — start with `fulcrum serve monitor`".

**Patterns to follow:**
- Ink v4 `render()`, `useInput()`, `Box`, `Text` components from official Ink docs
- `packages/cli/src/log.ts` `formatEvent()` for event rendering (import and reuse)
- `packages/monitor/src/server.ts` endpoint URLs for data fetching

**Test scenarios:**
- Happy path: `runTui()` called when `stdout.isTTY = false` → prints error message and exits 1 (not a terminal)
- Happy path: `runTui()` called when monitor is not running → renders in fallback read-only mode without throwing
- Test expectation: Ink component rendering is not unit-tested (Ink requires a real TTY for most assertions) — focus test on CLI routing and the non-rendering error path
- Integration: `useMonitor()` hook correctly parses `/board` response into `{ backlog, active, blocked, done }` shape

**Verification:**
- `fulcrum tui` starts in under 2 seconds with the monitor running. Board counts match `/board` endpoint. Keyboard `u` on a blocked run triggers `POST /runs/:id/unblock` and the run disappears from the policy pane.

---

### Phase 4: Zero-Friction Install

- [ ] **Unit 10: `npx fulcrum-mcp init` — Zero-Friction Agent Setup**

**Goal:** `npx fulcrum-mcp init` detects installed agents, configures all detected runtimes, and validates the install with doctor — completing in under 30 seconds.

**Requirements:** R1, R2, R3, R4, R5, R6

**Dependencies:** Unit 3 (hook auto), Unit 4 (cursor/windsurf)

**Files:**
- Modify: `packages/fulcrum-mcp/src/index.ts` — add `init` subcommand detection and dispatch
- Create: `packages/fulcrum-mcp/src/init.ts` — `runInit()` with agent detection and orchestration
- Test: `packages/fulcrum-mcp/src/tests/init.test.ts`

**Approach:**
- `packages/fulcrum-mcp/src/index.ts`: detect `process.argv[2] === 'init'` before the `serve mcp` argv splice. If `init`, call `runInit()` from `./init.ts` and exit.
- `runInit()` detection logic:
  - Claude Code: `existsSync(join(HOME, '.claude'))` → call `installClaude()` from `agent-integration/install.ts`
  - Gemini: `existsSync(join(HOME, '.gemini'))` or `which('gemini')` → call `installGemini()`
  - Cursor: `existsSync(join(HOME, '.cursor'))` or `existsSync(join(CWD, '.cursor'))` → call `installCursor()` (Unit 4)
  - Windsurf: `existsSync(join(HOME, '.windsurf'))` → call `installWindsurf()` (Unit 4)
  - PI: `which('pi')` → call `installPI()`
- Skip kuzu/L2 install (L2 is opt-in). Do not download ONNX models (deferred to first `fulcrum memory accelerate`).
- After all agent installs complete, run `fulcrum doctor` (resolve binary path explicitly — never bare `spawnSync('fulcrum', ...)`).
- Print summary: `Configured: Claude Code, Gemini, Cursor | Next: Restart Claude Code to load the MCP server`.
- `--dry-run` flag: print detected agents and what would be configured, without applying.
- `--force` flag: re-run install steps even if already configured (overrides idempotency check).
- The install is idempotent by default: each step's skip-condition checks for presence of target files before writing.

**Patterns to follow:**
- `agent-integration/install.ts` `step()` helper for each install action
- `packages/cli/src/doctor.ts` `runDoctor({ json: true })` for the post-install gate
- `agent-integration/install.ts` binary path resolution pattern

**Test scenarios:**
- Happy path: `runInit()` with `HOME` pointing to a temp dir with `.claude/` → installs Claude config files, doctor gate runs
- Happy path: `--dry-run` prints detected agents without writing any files
- Happy path: idempotent — running twice doesn't duplicate config entries
- Edge case: no agents detected → prints "No supported agent CLIs found. Manual install: see docs/guides/installation.md"
- Edge case: one agent install step fails → remaining agents still configured, WARN shown for failed agent
- Error path: doctor gate fails after install → print doctor output and suggest `fulcrum doctor --fix`

**Verification:**
- A machine with `~/.claude/` but not `~/.gemini/` → only Claude paths are configured. Doctor runs and outputs its report. No files written to the wrong locations.

---

## System-Wide Impact

- **Interaction graph:** `blockAgentRun()` in `fulcrum-core/src/runs.ts` gains a notification side-effect. All SSE consumers (TUI, browser web UI) benefit from the event bus bridge. `main()` in `packages/cli/src/index.ts` now stores plugin `additionalTools` at module level — test isolation may require resetting this between test cases.
- **Error propagation:** Notification errors in `notifyBlocked()` are swallowed after logging to stderr. SSE controller enqueue errors (e.g., connection reset) are caught per-controller — one broken connection doesn't affect others. Monitor write endpoint errors return structured JSON `{ error }` — never HTML 500s.
- **State lifecycle risks:** The `_pluginAdditionalTools` module-level variable in `index.ts` is set once in `main()`. If `main()` is called multiple times (test context), it must be reset. Consider using a function-scoped approach or explicitly resetting in test setup.
- **API surface parity:** The monitor write endpoints expose the same behavior as MCP tool calls — they must remain in sync if tool handler behavior changes. Adding a new tool that creates/modifies domain entities should prompt adding the corresponding monitor write endpoint.
- **Integration coverage:** The SSE bridge integration test must verify that `emitEvent()` → `onAny()` → SSE controller enqueue is a synchronous single-tick chain.
- **Unchanged invariants:** Existing GET endpoints on the monitor remain unchanged. All MCP tool handlers in ToolRegistry are unchanged. Hook behavior for claude/gemini/pi direct commands is unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Ink v4 + React adds ~2MB to CLI package | Dynamically import `ink` and `react` in `runTui()` — only loaded when `fulcrum tui` runs |
| EventSource polyfill (undici) version mismatch | Pin to undici version already bundled with Node 20 built-ins — test in CI with Node 20 and 22 |
| Monitor write endpoints break existing REST consumers | Mutation endpoints are additive — existing GET consumers unaffected. Auth is opt-in (env var) |
| `_pluginAdditionalTools` module state leaks between tests | Add `afterEach(() => { resetPluginState() })` in test files that test plugin contribution |
| Binary resolution in `npx fulcrum-mcp init` fails in npm cache | Resolve via `import.meta.url`-relative path to `node_modules/.bin/fulcrum` — fallback to PATH if not found |
| Cursor/Windsurf `.mdc` format diverges from documented spec | Template content is plain markdown with YAML frontmatter — no proprietary syntax, minimal drift risk |
| `spliceSection` bug in `gen-claude-md.ts` corrupts CLAUDE.md | Fix `spliceSection` bug (inverted marker case) in Unit 4 before using it in cursor/windsurf init path |

## Documentation / Operational Notes

- `docs/guides/installation.md` — update to document `npx fulcrum-mcp init` as the primary install path. Add Cursor and Windsurf sections.
- `docs/guides/monitor.md` — add web UI section, write endpoint reference, auth configuration.
- `docs/guides/cli-reference.md` — add `fulcrum tui`, `fulcrum log`, `fulcrum hook auto`, `fulcrum init --cursor/--windsurf`, `fulcrum doctor --fix` to command reference.
- `README.md` — update Quick Start to show `npx fulcrum-mcp init` as the zero-friction path. Update architecture diagram to include TUI.
- `CLAUDE.md` (global) — update tool count (currently drifted). Run `gen:claude-md` as part of each `serve mcp` startup.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-16-install-tui-dashboard-requirements.md](docs/brainstorms/2026-04-16-install-tui-dashboard-requirements.md)
- Related ideation: [docs/ideation/2026-04-16-install-tui-dashboard-ideation.md](docs/ideation/2026-04-16-install-tui-dashboard-ideation.md)
- Prior install plan: [docs/plans/2026-04-15-001-feat-fulcrum-install-to-value-plan.md](docs/plans/2026-04-15-001-feat-fulcrum-install-to-value-plan.md)
- Ink docs: https://github.com/vadimdemedes/ink
- Hono static serving: https://hono.dev/middleware/builtin/serve-static
