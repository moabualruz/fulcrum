---
date: 2026-04-15
topic: fulcrum-ux
focus: Improve UX from installation through full system use, inspired by context7's install model
---

# Ideation: Fulcrum UX — Install to Value

## Codebase Context

**Project shape:** TypeScript + pnpm monorepo, 11 packages, SQLite (WAL + FTS5), 1308 tests. CLI + MCP server (23 tools) + three-layer memory + agent orchestration + HTTP monitor + policy engine.

**Critical gap (broken chain):** The dominant user path — install Fulcrum → use Claude Code → do real work — produces **zero Fulcrum state changes**. The PreToolUse hook fires on every tool call but has no run_id context. Nothing calls `start_agent_run`. Memory recall never fires. Agent runs never appear in the DB. Users see no value despite installation.

**Install friction:** `pnpm install && pnpm run setup` — ~3 minutes, native kuzu build, ONNX model download on first `serve mcp` (1-2 min silent delay), Claude MCP requires session restart, PATH issues post-install. Context7 reference: `npx context7-mcp`, one JSON line in Claude MCP config, immediate value.

**Documentation drift:** CLAUDE.md claims 13 MCP tools; reality is 23. Every agent session starts misconfigured.

**Undiscovered bootstrap:** 23 tools exist but the intended bootstrap sequence (`get_current_context` → `build_cos_context` → `start_agent_run`) is never discovered — each response gives no signal about what to call next.

---

## Ranked Ideas

### 1. Fix the Broken Chain: Passive Trace Harvesting
**Description:** The PreToolUse hook already calls `fulcrum hook claude` on every tool call and reads the event from stdin. Currently it only logs and discards after policy enforcement. Change it to also write a lightweight `hook_event` row (tool name, actor role, session hash, timestamp) to SQLite. Every Claude session produces visible Fulcrum state with zero changes to agent behavior or MCP tooling.
**Rationale:** Single most critical gap. Zero DB writes on the dominant user path means everything downstream (monitor, memory, analytics, CLAUDE.md lifecycle) has no consumer. One DB write in the hook closure fixes this permanently for every session.
**Downsides:** Hook must stay fast (< 5ms). `hook_event` table needs TTL/rotation. Session identity requires a session token (temp file at session start).
**Confidence:** 92%
**Complexity:** Low-Medium
**Status:** Explored

### 2. Zero-Install npx Bootstrap
**Description:** Publish `fulcrum-mcp` as an npm package runnable via `npx fulcrum-mcp`. No repo clone, no pnpm, no kuzu native build, no symlink. One JSON line in Claude MCP config. Kuzu L2 becomes a peer dep triggered only on `fulcrum memory accelerate`, not on install.
**Rationale:** Current install path has ~3-minute native build, 8 manual steps, PATH issue. npx model collapses to 10 seconds. Direct context7 analog.
**Downsides:** npm publishing + version management. Prebuilt binary matrix for Node version coverage.
**Confidence:** 88%
**Complexity:** Medium
**Status:** Explored

### 3. Memory Auto-Write on Run Completion
**Description:** When `complete_agent_run` is called, automatically write a structured memory entry (task title, summary, artifact paths, outcome, duration, role). `block_agent_run` writes a `blocked`-tagged entry. Zero agent behavior change required.
**Rationale:** Memory only compounds if written. No forcing function exists today. After 10 completed runs, `recall_memory` returns genuinely useful history. Core value proposition activated for free.
**Downsides:** Volume noise at high run counts. Less curated than hand-written memories. Needs `--no-auto-memory` opt-out.
**Confidence:** 87%
**Complexity:** Low
**Status:** Explored

### 4. Generate CLAUDE.md from Source
**Description:** Make the installed CLAUDE.md a generated artifact. During `fulcrum setup` / MCP startup, regenerate from a template that reads actual tool count, invariant list, and role count from the codebase. `fulcrum codegen docs` makes this explicit.
**Rationale:** CLAUDE.md claims 13 tools, reality is 23. First document every agent reads. Wrong count is a trust-poisoning bug that propagates to every session. Generation makes accuracy automatic.
**Downsides:** Adds codegen step to setup/upgrade. Manual customization harder. Needs editable vs. generated section delineation.
**Confidence:** 90%
**Complexity:** Low
**Status:** Explored

### 5. Monitor Auto-Starts with MCP Server
**Description:** When `fulcrum serve mcp` starts, spawn the monitor HTTP server (port 4721) as a child process automatically. Dashboard URL included in startup stdout and `get_current_context` response.
**Rationale:** Real-time visibility into runs, memory writes, hook events is the most convincing Fulcrum demo. Currently gated behind a separate command almost no one runs. Auto-starting costs nothing (Hono server already exists). Direct context7 pattern.
**Downsides:** Adds port 4721 without user consent. Needs `--no-monitor` flag. ~50ms startup overhead.
**Confidence:** 85%
**Complexity:** Low
**Status:** Explored

### 6. `get_current_context` Readiness Object
**Description:** Extend the `get_current_context` response with a `readiness` field: `{ tools_available: 23, monitor_url: "http://localhost:4721", doctor_warnings: [...], suggested_next_call: "build_cos_context", hook_active: true }`. Agents get a guided path forward without reading documentation.
**Rationale:** Bootstrap sequence is undiscovered because each response gives no signal about what comes next. Self-documenting API design applied to agent UX. Surfaces doctor warnings at the exact moment they matter.
**Downsides:** Lightweight health check on every call — must stay fast. `suggested_next_call` may be too simplistic for complex workflows.
**Confidence:** 82%
**Complexity:** Low
**Status:** Explored

### 7. Install-to-Value Checkpoint
**Description:** Two setup changes: (1) Run `fulcrum doctor` as the final setup step and gate on green — fail with recovery hint on any FAIL-level check. (2) Write one real task and one memory entry during setup to validate the write path and make monitor/board non-empty immediately.
**Rationale:** Empty dashboard after a painful install communicates "nothing works." Doctor gate catches PATH, hook, and MCP registration issues before the first session. Seed write proves DB write path works and makes every feature demonstrable from session 1.
**Downsides:** Doctor gate may block CI/Docker installs. Needs `--no-gate` bypass. Seed data must be tagged `source: 'setup'` to not pollute metrics.
**Confidence:** 83%
**Complexity:** Low
**Status:** Explored

---

## Rejection Summary

| Idea | Reason Rejected |
|------|----------------|
| Lazy kuzu / L2 deferral | Subsumed by zero-install (implementation prerequisite) |
| Eliminate pnpm requirement | Subsumed by npx distribution idea |
| Prebuilt binary distribution | Subsumed by zero-install |
| Ghost Run / Ambient Run Inference | Duplicates Passive Trace Harvesting but weaker (post-hoc vs. real-time) |
| Session Bootstrap Tool (`hello`) | Covered by `get_current_context` readiness object |
| Workspace Status as Session Auto-Briefing | Covered by readiness object + ideas #1 and #6 |
| PATH self-healing | Subsumed by install checkpoint + doctor gate |
| Guided `fulcrum quickstart` | Covered by install checkpoint + readiness object |
| Value-First Onboarding Snapshot (demo seed data) | Weaker form of install checkpoint |
| MCP Hot-Reload Shim | High complexity for one-time friction; better as platform feature request |
| Lazy Embedding / Background Pre-Warm | Valid but secondary; model download is one-time, broken chain is every session |
| Auto-Hook Injection on MCP startup | Subsumed by install fix |
| Implicit Role Assumption | Speculative inference; fix explicit path first |
| MCP-Native Role Switching | Depends on chain fix first; brainstorm downstream |
| Session Replay | Excellent downstream brainstorm from idea #1 |
| Hook Telemetry → Pattern Surface | Depends on data existing; brainstorm once chain is fixed |
| Single-Command Runtime Registration | Secondary; not on critical path |
| Deferred Validation Gate Removal | Too vague; engineering hygiene |
| Implicit Workspace Init (no .fulcrum.json) | Incremental; risky for users expecting config files |
| `build_cos_context` in CLAUDE.md | Subsumed by CLAUDE.md auto-generation |
| `board show` in `get_workspace_status` | Downstream of fixing the chain |
| Fulcrum as a Bootloader | Depends on npx + chain fixes first |

---

## Session Log
- 2026-04-15: Initial ideation — ~38 raw candidates across 4 agents, 7 survivors. All 7 marked for brainstorm.
- 2026-04-15: All 7 ideas explored — brainstorm → requirements doc → plan produced. Plan at `docs/plans/2026-04-15-001-feat-fulcrum-install-to-value-plan.md`. All ideas marked Explored.
