---
date: 2026-04-16
topic: install-tui-dashboard
focus: Zero-friction installation path (context7-style), Cockpit TUI, Web Monitor as Control Room, PM Dashboard
status: complete
---

# Ideation: Install Path · Cockpit TUI · Web Monitor / PM Dashboard

## Codebase Context

**Project shape:** TypeScript pnpm monorepo (12 packages, @fulcrum/*), SQLite WAL+FTS5, 1505 tests. Local-first AI agent OS with task management, 3-layer memory, policy enforcement, team orchestration, unified ToolRegistry (27 tools, CLI+MCP from one source), Hono HTTP monitor (port 4721) with extensive JSON API + SSE.

**Completed recent work:**
- Unified ToolRegistry (all 27 tools, CLI+MCP from one source) ✅
- Hook pre-fetch injection (SessionStart writes snapshot, PreToolUse injects) ✅
- MCP profile filtering (`--profile hook-only` serves 20 tools) ✅
- `fulcrum tool exec <name> --json <payload>` for non-MCP platforms ✅
- Context-aware `suggested_next_call` in empty workspace ✅

**Critical gaps:**
- No one-liner install; `pnpm install && pnpm run setup` requires 3-min native build
- No agent auto-detection; claude/gemini/pi/cursor/windsurf are siloed manual paths
- No Cockpit TUI — operators have zero live terminal view
- Web monitor is raw JSON only — no UI, no write controls
- GAP-PLUGIN-1: `discoverPlugins()` exists but is never called
- No human notification path when an agent blocks

**Agent support matrix:**
| Agent | Hooks | MCP | Rules/Context | Install path |
|-------|-------|-----|---------------|-------------|
| Claude Code | PreToolUse, SessionStart, PostToolUse, Stop, SubagentStart | Yes | CLAUDE.md | setup:claude |
| Gemini CLI | BeforeTool, AfterTool, BeforeAgent, AfterAgent, BeforeModel | Yes | GEMINI.md, skills/ | setup:gemini |
| Cursor | None | .cursor/mcp.json | .cursor/rules/*.mdc | Missing |
| Windsurf | None | Yes | .windsurf/rules/ | Missing |
| Codex | None | None | AGENTS.md only | N/A |
| PI | Custom | Yes | — | setup:pi |

---

## Ranked Ideas

### 1. Zero-Friction One-Command Install with Agent Auto-Detection
**Description:** `npx fulcrum-mcp init` (or `curl -fsSL fulcrum.sh | sh`) that: (1) detects which agent CLIs are installed via `which`/filesystem probes (`~/.claude/`, `~/.gemini/`, `.cursor/`, `.windsurf/`), (2) writes the correct config for each detected agent (MCP JSON, hook snippet, CLAUDE.md / GEMINI.md / .mdc rules, Gemini extension manifest), (3) installs the `fulcrum` binary symlink, (4) runs `fulcrum doctor` as a gate, (5) emits a summary of what was configured. The native kuzu build is skipped by default (L2 is opt-in). Total time: under 30 seconds.

**Rationale:** This is the single highest-leverage gap. The current path requires cloning a 12-package monorepo, understanding pnpm, waiting 3 minutes for a native build, and executing multiple setup commands. Context7's UX target = `npx context7-mcp`, one JSON line, immediate value. Every extra step is a drop-off point. The detect-then-configure pattern matches how `gh`, `aws configure`, and `vercel` work — users expect zero-decision setup.

**Implementation notes:**
- `agent-integration/install.ts` already has all per-agent logic; the missing piece is the detector + orchestrator
- `npm exec fulcrum-mcp init` is already possible since `fulcrum-mcp` package exists — just needs the `init` subcommand
- Per-agent detection: `execSync('claude --version')` → write `~/.claude/settings.json` hook + `~/.claude.json` MCP entry; `ls ~/.gemini` → write extension manifest; `.cursor/` → write `.cursor/mcp.json` + `.cursor/rules/fulcrum.mdc`
- ONNX model is deferred to first `fulcrum memory accelerate` call, not install time
- Idempotent: re-running does nothing if already configured (doctor gate)

**Downsides:** npm publish pipeline + version management needed. Prebuilt `better-sqlite3` binaries for Node 20/22 on macOS arm64/x64 + Linux x64 must be bundled.
**Confidence:** 93%
**Complexity:** Medium

---

### 2. Cockpit TUI — `fulcrum tui`
**Description:** A full terminal-native dashboard built with Ink (React for terminals) that provides a live operational view: (a) Task board pane — Kanban columns (backlog/active/blocked/done) with task titles, assigned roles, and age; (b) Agent runs pane — last 15 runs with status indicator, heartbeat lag, and role; (c) Event stream pane — live tail of `/events/stream` SSE rendered as human-readable lines; (d) Policy pane — recent violations, blocked runs with blocker reason; (e) Memory pane — recent memory writes with tag and importance; (f) Keyboard controls: `enter` to select, `u` to unblock a run, `k` to kill, `n` to create task, `q` to quit; (g) Header bar: workspace name, active run count, last sync time.

**Rationale:** Operators running 5+ parallel agents have zero live visibility without multiple `curl | jq` commands. The SSE infrastructure already emits every state change; there is no human-readable consumer. A TUI turns Fulcrum from a headless service into an observable system you can watch. The data is fully available; only the presentation layer is missing. This is the highest-value UX improvement for daily operators.

**Implementation notes:**
- Use `ink` (v4+) for React-based terminal rendering — same API as React, no browser build step
- TUI reads from `http://localhost:4721` (same Hono server) via fetch + EventSource polyfill
- Falls back to direct SQLite read if monitor not running (via `@moabualruz/fulcrum-core`'s `getDb()`)
- Keyboard controls map to HTTP POST endpoints on the monitor (Idea #3 prerequisite for writes)
- Lives in `packages/cli/src/tui/` — new subcommand `fulcrum tui`
- Panels are fixed layout initially; plugin panels (agent-specific widgets) as v2

**Downsides:** Ink adds a dependency. Terminal resize handling requires care. SSE EventSource not natively available in Node without a polyfill (or use undici's EventSource). Write controls require Idea #3 to land first.
**Confidence:** 91%
**Complexity:** Medium-High

---

### 3. Monitor as Control Room — Write Endpoints + Thin Web UI
**Description:** Transform the HTTP monitor from a read-only telemetry API into a bidirectional control surface: (a) Add `POST /tasks` (create task), `PATCH /tasks/:id` (update status/priority), `POST /runs/:id/unblock`, `POST /runs/:id/complete`, `POST /runs/:id/kill`, `POST /reviews/:id/approve`, `POST /reviews/:id/reject` — thin proxies to the ToolRegistry handlers already implemented; (b) Add a thin, static web UI (single HTML file with vanilla JS + Tailwind CDN, no build step) served at `GET /` that renders the board, active runs, event stream, and mutation buttons; (c) Bearer token auth for mutation endpoints (token set via `FULCRUM_MONITOR_TOKEN` env var, default to development mode with localhost-only).

**Rationale:** A PM who spots a blocked run in the monitor currently must open an agent session, call MCP tools via the agent, and hope the agent completes the action. Write endpoints make the monitor actionable — humans can intervene without touching the agent. A minimal web UI (not a full SPA) means zero build toolchain while delivering immediate visual value. The `/policy/check` POST endpoint proves Hono is already wired for writes; this extends the pattern.

**Implementation notes:**
- All mutation logic already lives in ToolRegistry — monitor routes are thin adapters: `import { toolRegistry } from '../cli/tool-registry.js'; await registry.get('update_task').execute(body)`
- Static HTML served via `app.get('/', serveStatic({ root: './public' }))` using Hono's static middleware
- Web UI: single-page, no framework. Sections: board summary, active agents table, event log (EventSource), blocked runs panel, quick actions panel
- SSE-driven updates in the browser (EventSource API, supported natively in all browsers)
- Auth: `Authorization: Bearer <token>` header check on all POST/PATCH routes; `FULCRUM_MONITOR_TOKEN` env var; skip auth on localhost-only mode

**Downsides:** Static HTML must be kept minimal to avoid build toolchain creep. Auth is bearer-token only (no OAuth). Session management not addressed.
**Confidence:** 90%
**Complexity:** Medium

---

### 4. Event Bus → SSE Bridge (Real-Time Foundation)
**Description:** Subscribe the in-process `FulcrumEventBus` (which fires synchronously on every state change) directly to the SSE writer, eliminating the 500ms poll loop in `monitor/src/server.ts`. Every task update, run state change, memory write, and policy violation streams to connected clients in under 5ms instead of up to 500ms. This is the foundational change that makes both the TUI (Idea #2) and the web monitor (Idea #3) genuinely real-time.

**Rationale:** The current SSE poll loop (`setInterval(poll, 2000)`) means the web monitor and any TUI consumer are always 0–2 seconds stale. For a system designed to show live agent activity, this is perceptible lag. `getEventBus().onAny(handler)` is a one-call subscription that turns the event system from push-on-read to push-on-write. This single change makes everything downstream more responsive.

**Implementation notes:**
- `event-bus.ts` has `onAny(callback)` — subscribe at monitor startup with a reference to the SSE writer set
- Monitor holds a `Set<ReadableStreamController>` of active SSE connections; on each event, encode and enqueue to all
- Remove the `setInterval` poll from `server.ts` — keep as fallback for resume (Last-Event-ID replay still needs DB query)
- Connection teardown: remove controller from Set on `abort` signal
- Test: use in-process fetch pattern (no port binding)

**Downsides:** Event bus is in-process; if monitor is started as a subprocess, events don't cross process boundary — must run in same process as core. This is already the case for `fulcrum serve all`.
**Confidence:** 95%
**Complexity:** Low-Medium

---

### 5. `fulcrum doctor --fix` — Self-Healing Setup
**Description:** Extend the existing `fulcrum doctor` command with a `--fix` flag that auto-applies remediations for every FAIL and WARN with a known fix: (a) Missing binary symlink → recreate it; (b) Hook not installed → merge the PreToolUse snippet; (c) MCP server not in Claude config → run `claude mcp add`; (d) Missing CLAUDE.md / GEMINI.md → emit from template; (e) Stale agent runs (heartbeat expired) → mark as `timed_out`; (f) Pending migrations → run them. Doctor becomes `fulcrum doctor` for diagnosis and `fulcrum doctor --fix` for one-command repair.

**Rationale:** The gap between "doctor shows a FAIL" and "you know how to fix it" is where installs stall. The fix logic already exists in `agent-integration/install.ts` — `--fix` is a conditional invocation of those functions from the doctor runner. This converts the doctor from a reporting tool into a self-healing entrypoint. Users who encounter any setup problem get a single recovery command without reading docs.

**Implementation notes:**
- `doctor.ts` has `CheckResult` with `recovery?: string` field — populate it for every check
- Each check returns a `fix?: () => Promise<void>` alongside the result; `--fix` flag calls all available fixes after diagnosis
- Install functions in `agent-integration/install.ts` are the fix implementations (already rollback-aware)
- `--dry-run` mode lists what `--fix` would do without applying

**Downsides:** Some fixes require user confirmation (e.g., modifying `~/.claude.json`). Must avoid destructive silent fixes. Need a `--yes` flag for CI/scripted use.
**Confidence:** 88%
**Complexity:** Low

---

### 6. Cursor and Windsurf First-Class Support
**Description:** `fulcrum init --cursor` and `fulcrum init --windsurf` that write: (1) `.cursor/mcp.json` / `.windsurf/mcp.json` wiring the MCP server; (2) `.cursor/rules/fulcrum.mdc` with YAML frontmatter (`alwaysApply: true`) containing a compact Fulcrum context block (workspace_id, project_id, available tools, lifecycle protocol — equivalent to the CLAUDE.md section but in Cursor's format); (3) Per-role rule files (one `.mdc` per agent role with `globs` pattern matching code files the role typically touches). These platforms have no hook system but MCP + always-applied rules deliver ~70% of the value.

**Rationale:** Cursor is one of the most widely deployed AI editors. `agent-integration/` has `claude/`, `gemini/`, `pi/`, `opencode/` but no `cursor/` directory — the gap is explicit. Cursor users currently have zero Fulcrum integration. An `alwaysApply: true` rules file ensures the agent knows about Fulcrum on every prompt. Combined with MCP server access, this covers task creation, run lifecycle, and memory recall from Cursor sessions.

**Implementation notes:**
- `.cursor/rules/fulcrum.mdc` template: frontmatter `{ description: "Fulcrum agent OS context", alwaysApply: true }`, body = compact version of CLAUDE.md lifecycle section
- Per-role `.mdc` files: e.g., `.cursor/rules/fulcrum-software-engineer.mdc` with `globs: ["src/**/*.ts", "packages/**/*.ts"]`
- `.cursor/mcp.json`: `{ "mcpServers": { "fulcrum": { "command": "fulcrum", "args": ["serve", "mcp"] } } }`
- Windsurf: same pattern with `.windsurf/rules/` path
- Auto-detection: check for `.cursor/` or `.windsurf/` directory in `$HOME` or workspace root

**Downsides:** No hook system means no passive trace harvesting, no pre-fetch injection, no policy enforcement at tool time. MCP-only. Accept this limitation explicitly in docs.
**Confidence:** 86%
**Complexity:** Low-Medium

---

### 7. Human Notification on Block + `fulcrum log`

**Part A — Block Notification:**
When `block_agent_run` is called, trigger a notification: desktop notification via `node-notifier` (cross-platform: macOS, Linux `notify-send`, Windows toastify), append to `~/.local/share/fulcrum/alerts.log`, and POST to a user-configured webhook URL (`FULCRUM_ALERT_WEBHOOK` env var, Slack-compatible JSON payload). The `escalation_reason` field already exists in `block_agent_run` — it becomes the notification body.

**Part B — `fulcrum log`:**
A CLI command that renders the event stream as human-readable text: `[14:22:01] software_engineer started run run_xxx on "Add dark mode"`, `[14:35:12] run_xxx completed — 3 files changed`, `[14:51:44] qa_engineer BLOCKED: "tests fail on CI"`. `--follow` flag for live tail. `--run-id` filter. `--since 1h` time filter.

**Rationale:** Blocked runs that nobody notices are productivity black holes. Block notification converts a silent failure into an interruption that gets human attention. `fulcrum log` gives operators the equivalent of `git log` for agent activity — a clear historical record without requiring a TUI or browser. Both are high-value, low-complexity additions that make Fulcrum observable without new infrastructure.

**Implementation notes:**
- Block notification: hook into `blockAgentRun()` in `@moabualruz/fulcrum-core/src/runs.ts` — after DB write, fire async notification (fire-and-forget, never blocks the run)
- `node-notifier` is cross-platform; fall back gracefully on unsupported systems
- Webhook: `fetch(FULCRUM_ALERT_WEBHOOK, { method: 'POST', body: JSON.stringify(slackPayload) })` — async, no retry needed (best-effort)
- `fulcrum log`: reads `/events/stream` SSE when monitor is running; falls back to DB query on `events` + `hook_events` tables
- Log format: `[HH:mm:ss] <role> <verb> <noun> — <detail>` — maps `event_type` to human verb

**Downsides:** Desktop notifications require `node-notifier` (additional dep). Webhook URL is best-effort (no delivery guarantee). `fulcrum log` reads SSE which requires monitor running.
**Confidence:** 85%
**Complexity:** Low

---

### 8. Live Plugin Activation (GAP-PLUGIN-1 Fix)
**Description:** Call `discoverPlugins()` at `runServeMcp()` startup and pass the result to `createFulcrumMcpServer()` as `additionalTools` and `middleware`. One import + one call. This activates the entire plugin ecosystem — any npm package with `"fulcrum": { "type": "plugin" }` in its manifest is now auto-loaded with its hooks, skills, and agent definitions.

**Rationale:** This is the single highest-leverage line of code in the codebase. `discoverPlugins()` is fully implemented, tested, and correct — it just isn't called. Fixing this turns Fulcrum from a closed system into an open platform where any team can publish an npm plugin with domain-specific tools, hooks, and agent definitions. This is the ecosystem flywheel enabler.

**Implementation notes:**
- In `packages/cli/src/mcp-server.ts` (or `index.ts` where `runServeMcp` is called): `const plugins = await discoverPlugins(); registerPlugins(plugins);`
- Pass `plugins.additionalTools` to `McpServerOptions.additionalTools`
- Pass `plugins.hookModules` to hook middleware chain
- Add global plugin directory scan: `discoverPlugins()` should also walk `globalDataDir()/plugins/` (GAP-PLUGIN-5 fix, trivial alongside this)
- `fulcrum plugin add <npm-package>`: `npm install --prefix globalDataDir()/plugins/ <pkg>`

**Downsides:** Plugin code runs in-process — a malicious or broken plugin can crash the MCP server. Sandboxing deferred to v2. Document this as "install only trusted plugins."
**Confidence:** 97%
**Complexity:** Very Low (one call), Low for plugin add command

---

## Cross-Cutting Synthesis

**Combination A — Install + Config Emission from DB:** The zero-friction install (Idea #1) emits agent configs from the `agent_definitions` table rather than static templates. When a role's `tools_deny` changes, `fulcrum emit-config <runtime>` regenerates the correct `.mdc` / `CLAUDE.md` / extension manifest. Config drift becomes impossible.

**Combination B — Event Bus Bridge + TUI + Web Monitor:** Ideas #2, #3, #4 form a stack. The event bus bridge (Idea #4) is the foundation — it makes SSE genuinely real-time. The TUI (Idea #2) and web monitor (Idea #3) are two consumers of the same real-time stream. Implement #4 first, then #2 and #3 in parallel.

**Combination C — Doctor --fix + Zero-Friction Install:** `npx fulcrum-mcp init` becomes the first-run path; `fulcrum doctor --fix` becomes the repair path. Together they cover 100% of the install-to-working funnel without manual steps.

---

## Rejected Ideas (with reasons)

| Idea | Reason for rejection |
|------|---------------------|
| TUI replaces web monitor entirely | Web monitor serves remote/CI access (different consumer profile); both should coexist |
| Agents register dynamic UI panels | Premature plugin complexity; server-side rendered fragments from agents is operationally fragile |
| A2A Card Federation via LAN multicast | Out of scope for single-machine use case; operational complexity outweighs value |
| Policy as installation unit (signed certs) | Philosophical reframe without clear deliverable; approval workflow not designed |
| Agent definitions as self-amending living contracts | Requires full approval workflow; large scope; defer |
| P2P Fulcrum sync fabric | Very large scope; single-machine assumption holds for MVP |
| CLI as agent shell (subprocess-first) | Already implemented via `@moabualruz/fulcrum-worker` subprocess adapter; not new |
| Schema-derived TUI auto-generated from HTTP routes | HTTP routes aren't typed enough to infer layout decisions; TUI still requires manual panel design |

---

## Session Log

- 2026-04-16: Initial ideation run across four frames (user friction, inversion, assumption-breaking, leverage). 40 raw candidates generated. 8 survivors after adversarial filtering. 3 cross-cutting combinations identified. 8 ideas explicitly rejected with reasons.
