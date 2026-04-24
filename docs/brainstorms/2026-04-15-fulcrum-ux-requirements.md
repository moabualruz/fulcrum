# Requirements: Fulcrum UX — Install to Value (7 Features)

**Date:** 2026-04-15
**Source ideation:** `docs/ideation/2026-04-15-fulcrum-ux-ideation.md`
**Status:** Draft

---

## Context

Seven improvements to the Fulcrum install-to-value path, grounded in a two-part finding:

1. **Broken chain**: The dominant user path (install → use Claude → do real work) produces zero Fulcrum state changes. The PreToolUse hook fires but writes nothing without a `run_id`. Nothing calls `start_agent_run` in a normal Claude session.

2. **Install friction**: `pnpm install && pnpm run setup` takes 3+ minutes with native builds, requires session restart for MCP, and has no "done" indicator. Reference: context7 installs as `npx context7-mcp` with one JSON line.

---

## Feature 1: Fix the Broken Chain — Passive Trace Harvesting

### What it is

The PreToolUse hook at `packages/cli/src/hooks.ts` currently does secret scanning and policy enforcement but writes nothing to the DB when no `run_id` is present. The PostToolUse hook writes `tool_trace` memories but only when `ctx.runId` is set.

Change: write a lightweight `hook_event` row on every PreToolUse hook invocation, regardless of `run_id`. This makes every Claude session produce visible Fulcrum state with zero changes to agent behavior.

### Behavior

**New table**: `hook_events` (migration m051 or next available — the last existing migration is m050)
```
hook_event_id  TEXT  PRIMARY KEY  -- newId('hev_')
workspace_id   TEXT  NOT NULL
session_id     TEXT  NOT NULL
tool_name      TEXT  NOT NULL
agent_role     TEXT  NOT NULL DEFAULT ''
run_id         TEXT              -- nullable — the gap we're working around
ts             TEXT  NOT NULL    -- ISO 8601
cli_name       TEXT  NOT NULL    -- 'claude' | 'gemini' | 'pi'
```

**Write location**: In `runPreHook()` in `packages/cli/src/hooks.ts`, immediately before the `io.stdout(JSON.stringify({ continue: true }))` call (line ~185), inside a try/catch block. The write must precede `io.exit(0)` — any code after `io.exit` is unreachable. Best-effort: if the write throws, log a warning to stderr and proceed to the stdout/exit path unchanged. Failure must never cause the hook to exit non-zero.

**Session identity**: The hook already receives `sessionId` from the Claude event (field `session_id`). This is sufficient for grouping events per session without a separate temp file.

**Row retention**: Rows older than 30 days are deleted by the janitor cycle (`packages/core/src/janitor.ts`). The janitor already runs cleanup logic — add a `deleteOldHookEvents(workspace_id, db)` call.

### Acceptance Criteria

- [ ] After any Claude tool call (even `get_current_context`), at least one `hook_events` row exists in the DB for that session
- [ ] The monitor `/analytics/summary` response includes `hook_event_count`
- [ ] Hook latency overhead for the DB write is < 5ms on a warm SQLite connection (measured in a new test)
- [ ] If the DB write throws (disk full, locked), the hook still exits 0 and writes `{ continue: true }` to stdout
- [ ] The janitor deletes rows older than 30 days

### Edge Cases

- **No workspace_id in context**: Use empty string — same as the existing behavior in `runPreHook`
- **Multiple concurrent sessions**: `session_id` is per-Claude-session, so concurrent sessions produce distinct rows — no conflict
- **Hook called before DB is initialized**: Wrap in try/catch; skip write silently
- **High-frequency sessions** (1000s of tool calls): The 30-day TTL bounds table size; no index needed beyond `(workspace_id, session_id, ts)`

### Smallest First Slice

1. Add migration `m053` creating the `hook_events` table
2. In `runPreHook`, add a best-effort try/catch write **before** line 185 (`io.stdout(JSON.stringify({ continue: true })`), not after — code after `io.exit(0)` is unreachable
3. Add `hook_event_count` to `GET /analytics/summary` in `packages/monitor/src/server.ts`
4. Add one test: "after runPreHook is called, hook_events table has a row"

---

## Feature 2: Zero-Install npx Bootstrap

### What it is

Publish a new `fulcrum-mcp` npm package runnable as `npx fulcrum-mcp`. It boots the MCP server with no repo clone, no pnpm, no kuzu compilation. Kuzu (L2 graph) becomes an optional install triggered only by `fulcrum memory accelerate`, not at install time.

### Behavior

**New package**: `packages/fulcrum-mcp/` (or `packages/npx/`)
- `package.json` with `"bin": { "fulcrum-mcp": "./dist/index.js" }` and `"preferGlobal": false`
- Entry point (`src/index.ts`) re-exports `runFulcrumMcpServer` from `packages/cli/src/mcp-server.ts`
- Excludes `kuzu` from hard dependencies — moves it to `optionalDependencies`
- Ships prebuilt `better-sqlite3` bindings for Node 20/22 on macOS arm64/x64 + Linux x64

**Claude MCP config** (one line users add):
```json
{
  "mcpServers": {
    "fulcrum": {
      "command": "npx",
      "args": ["-y", "fulcrum-mcp"]
    }
  }
}
```

**Auto-init on startup**: When `fulcrum-mcp` starts, run `loadConfig()` + `runMigrations(getDb())` for the current directory. No separate `fulcrum init` required.

**kuzu split**: In `packages/memory/package.json`, move `kuzu` from `dependencies` to `optionalDependencies`. L2 code paths already check `l2_enabled` before calling kuzu — the runtime guard already exists, just needs the install-time guard.

### Acceptance Criteria

- [ ] `npx -y fulcrum-mcp` in a fresh directory starts the MCP server in under 10 seconds on macOS arm64 (no compilation)
- [ ] All 23 MCP tools are available after npx start
- [ ] `pnpm install` in the monorepo does not fail if kuzu fails to build (graceful optional dep handling)
- [ ] A new CI job (`ci/npx-smoke.yml`) runs `npx -y fulcrum-mcp &` + a test MCP client that calls `get_current_context` and verifies the response
- [ ] `docs/guides/installation.md` has an "npx (quick start)" section as the primary install path

### Edge Cases

- **npm cache hit**: `npx -y` uses cached version; acceptable — `npx -y fulcrum-mcp@latest` forces fresh
- **Node 18 (before drop)**: `better-sqlite3` prebuilts must cover Node 18/20/22
- **kuzu build fails at npm install time**: `optionalDependencies` means npm/pnpm log a warning but don't fail
- **Windows**: Prebuilt coverage needed; CI job covers win32-x64

### Smallest First Slice

1. Move `kuzu` to `optionalDependencies` in `packages/memory/package.json`; verify `pnpm install` succeeds without it
2. Create `packages/fulcrum-mcp/package.json` + thin entry point that calls `runFulcrumMcpServer`
3. Add `npx-smoke` CI job
4. Update `docs/guides/installation.md` with the one-liner

---

## Feature 3: Memory Auto-Write on Run Completion

### What it is

When `completeAgentRun` is called in `packages/core/src/runs.ts`, automatically write a structured memory entry. No agent behavior change required.

### Behavior

**Write trigger**: At the end of `completeAgentRun()`, after the DB update succeeds, call `writeMemory()` from `fulcrum-memory` with:
```typescript
{
  workspace_id: run.workspace_id,
  project_id: run.project_id ?? run.workspace_id,
  task_id: run.task_id ?? undefined,
  kind: 'task_outcome',
  scope: run.task_id ? 'task' : 'project',
  title: `Run completed: ${run.role} — ${run.task_id ?? 'no task'}`,
  content: [
    `Role: ${run.role}`,
    `Summary: ${input.output_summary ?? '(none)'}`,
    `Duration: ${durationMs}ms`,
    `Artifacts: ${(input.artifact_paths ?? []).join(', ') || '(none)'}`,
    `Tests: ${input.tests_passed ?? 0} passed, ${input.tests_failed ?? 0} failed`,
  ].join('\n'),
  summary: input.output_summary ?? `${run.role} run completed`,
  importance: 0.5,
  tags: [run.role, 'run_completion', ...(run.task_id ? [run.task_id] : [])],
  source: 'auto',   // NEW field — lets users filter out auto-written memories
}
```

Similarly, `blockAgentRun()` writes a memory with `kind: 'task_failure'` and `importance: 0.6`.

**`source` field**: Add `source TEXT DEFAULT 'manual'` to the `memories` table (migration m052) to distinguish auto-written entries from hand-written ones. `recall_memory` adds `source` to its returned fields.

**Opt-out**: `FULCRUM_NO_AUTO_MEMORY=1` env var skips the write. Checked at the top of the write path.

**Circular dependency guard**: `packages/core` must not import `packages/memory` (circular). Solution: use a dynamic import inside `completeAgentRun` — `const { writeMemory } = await import('fulcrum-memory')` — same pattern used by the hook today.

### Acceptance Criteria

- [ ] After `completeAgentRun({ run_id, summary: "did the thing" })`, a `task_outcome` memory row exists in the DB with `source='auto'`
- [ ] After `blockAgentRun({ run_id, reason: "stuck" })`, a `task_failure` memory row exists
- [ ] `recall_memory` results include `source` field
- [ ] `FULCRUM_NO_AUTO_MEMORY=1` suppresses the write (test this)
- [ ] No circular import: `packages/core` does not statically import `packages/memory`
- [ ] The write is non-blocking: if `writeMemory` throws, `completeAgentRun` still returns successfully

### Edge Cases

- **Run without task_id**: Memory scoped to project, not task — still written
- **Duplicate completion**: `completeAgentRun` throws `not_found` / `run_not_live` for re-completion — the memory write guard follows the same path (write only on first completion)
- **Very long summaries**: Truncate content to 2000 chars before writing
- **Tests**: Most core tests inject in-memory DB but don't have `fulcrum-memory` available; the dynamic import + `FULCRUM_NO_AUTO_MEMORY=1` in test env handles this

### Smallest First Slice

1. Add migration `m052` with `source` column on `memories`
2. Add dynamic `writeMemory` call at end of `completeAgentRun` in `packages/core/src/runs.ts`
3. Add same for `blockAgentRun`
4. Test: "completeAgentRun writes a task_outcome memory"

---

## Feature 4: Generate CLAUDE.md from Source

### What it is

The installed `agent-integration/claude/CLAUDE.md` has `<!-- GENERATED:tools-start -->` / `<!-- GENERATED:tools-end -->` markers (partially implemented). The header still reads "13 tools". Complete the generation: make the entire document regenerated from source, keyed by actual tool count, invariant count, and role count.

### Behavior

**Generator script**: `scripts/gen-claude-md.ts` (or `scripts/gen-agent-docs.ts`)
- Reads `TOOL_SCHEMAS` from `packages/cli/src/mcp-tools.ts` — count and names
- Reads `SYSTEM_INVARIANTS` from `packages/policy/src/engine.ts` — count and names
- Reads canonical role list from `packages/core/src/roles.ts` — count
- Reads a static template `agent-integration/claude/CLAUDE.md.template` for the non-generated sections
- Replaces `{{TOOL_COUNT}}`, `{{INVARIANT_COUNT}}`, `{{ROLE_COUNT}}` in the template
- Regenerates the `<!-- GENERATED:tools-start -->` block (already exists)
- Writes output to `agent-integration/claude/CLAUDE.md`

**npm script**: Add `"gen:agent-docs": "tsx scripts/gen-claude-md.ts"` to root `package.json`

**Setup integration**: `agent-integration/install.ts` calls `gen:agent-docs` during setup (or inline — reads the template and writes the generated file) so the installed CLAUDE.md is always current.

**CI guard**: Add a step to the CI pipeline that runs `gen:agent-docs` and then `git diff --exit-code agent-integration/claude/CLAUDE.md`. If the file diffs, CI fails with "CLAUDE.md is out of date — run pnpm gen:agent-docs".

**Header fix**: The "MCP Server" section header currently reads "exposes 13 tools". Replace with `{{TOOL_COUNT}} tools` in the template.

### Acceptance Criteria

- [ ] Running `pnpm gen:agent-docs` updates the CLAUDE.md tool count to match `TOOL_SCHEMAS.length`
- [ ] CI fails if CLAUDE.md is stale (tool count mismatch detectable by diff)
- [ ] `agent-integration/install.ts` calls the generator during setup
- [ ] The generated section covers tool name, description, and parameter table for each tool
- [ ] Adding a new tool to `mcp-tools.ts` + running `gen:agent-docs` updates CLAUDE.md in one step, no manual edit

### Edge Cases

- **Template missing**: Generator exits with clear error "template not found: agent-integration/claude/CLAUDE.md.template"
- **Tool schema missing description**: Generator uses tool `title` as fallback
- **Manual edits between generation runs**: The template guards the generated section with markers; edits outside the markers are preserved. Edits inside the markers are overwritten.
- **Multiple runtimes**: GEMINI.md and CODEX AGENTS.md have similar stale content — the generator can be extended to cover them (out of scope for first slice)

### Smallest First Slice

1. Extract `agent-integration/claude/CLAUDE.md` static sections into `agent-integration/claude/CLAUDE.md.template`, replacing the header tool count with `{{TOOL_COUNT}}`
2. Write `scripts/gen-claude-md.ts` that reads `TOOL_SCHEMAS` and writes the generated file
3. Add `gen:agent-docs` npm script and wire into `install.ts`
4. Add CI check step

---

## Feature 5: Monitor Auto-Starts with MCP Server

### What it is

When `fulcrum serve mcp` starts (`runFulcrumMcpServer` in `packages/cli/src/mcp-server.ts`), spawn the monitor HTTP server as a child process. The user gets the dashboard without running a separate command.

### Behavior

**Spawn location**: In `runFulcrumMcpServer()` (line ~503 in `mcp-server.ts`), after `server.connect(transport)` succeeds, spawn the monitor:

```typescript
const monitor = spawn(process.execPath, [
  '--import', 'tsx/esm',
  path.join(__dirname, '../../cli/src/index.ts'),
  'serve', 'monitor',
  '--port', String(monitorPort),
], {
  stdio: 'ignore',
  detached: false,  // dies with the MCP server
})
monitor.unref()
```

**Port**: Default 4721. Configurable via `FULCRUM_MONITOR_PORT` env var or `--monitor-port` flag on `fulcrum serve mcp`.

**Opt-out**: `--no-monitor` flag on `fulcrum serve mcp` or `FULCRUM_NO_MONITOR=1` env var skips the spawn.

**Startup message**: Print to stderr:
```
[fulcrum mcp] monitor started at http://127.0.0.1:4721
```

**`get_current_context` response**: Add `monitor_url: "http://127.0.0.1:4721"` field when monitor is running, `monitor_url: null` otherwise.

**Port conflict**: If port 4721 is already in use, log a warning to stderr and continue — the MCP server itself is unaffected. Do not fail startup.

### Acceptance Criteria

- [ ] `fulcrum serve mcp` starts and within 2 seconds `GET http://localhost:4721/status` returns `{ status: 'ok' }`
- [ ] `fulcrum serve mcp --no-monitor` starts without spawning the monitor
- [ ] `FULCRUM_NO_MONITOR=1 fulcrum serve mcp` skips monitor
- [ ] `get_current_context` returns `monitor_url: "http://127.0.0.1:4721"` when monitor is up
- [ ] Killing the MCP server process also kills the monitor (no orphan processes)
- [ ] Port conflict on 4721 logs a warning but does not crash the MCP server

### Edge Cases

- **npx context**: When running via `npx fulcrum-mcp`, `__dirname` is inside the npm cache — need to locate the monitor entry point correctly via the package exports, not a relative path
- **Monitor already running** (user ran `fulcrum serve all`): Port conflict → log warning → skip spawn. Already handled by port conflict case above.
- **Slow startup**: Monitor may not be ready for 1-2 seconds after spawn. `get_current_context` should probe readiness with a 100ms retry before returning `monitor_url`.

### Smallest First Slice

1. In `runFulcrumMcpServer`, after `server.connect(transport)`, add conditional monitor spawn
2. Wire `--no-monitor` flag to the `fulcrum serve mcp` CLI command in `packages/cli/src/index.ts`
3. Add `monitor_url` to `get_current_context` handler
4. Test: "serve mcp with monitor, GET /status returns ok"

---

## Feature 6: `get_current_context` Readiness Object

### What it is

Extend the `get_current_context` MCP tool response with a `readiness` field that gives agents an explicit oriented path forward without reading documentation.

### Behavior

**Current response** (from `mcp-tools.ts` outputSchema):
```json
{ "workspace_id": "ws_abc", "project_id": "proj_xyz", "cwd": "/home/user/myrepo" }
```

**New response**:
```json
{
  "workspace_id": "ws_abc",
  "project_id": "proj_xyz",
  "cwd": "/home/user/myrepo",
  "readiness": {
    "tools_available": 23,
    "monitor_url": "http://127.0.0.1:4721",
    "monitor_running": true,
    "hook_active": true,
    "doctor_warnings": [],
    "suggested_next_call": "build_cos_context"
  }
}
```

**Field semantics**:
- `tools_available`: `TOOL_SCHEMAS.length` — constant, not a probe
- `monitor_url`: populated only when monitor responded to `/status` within 200ms; otherwise `null`
- `monitor_running`: `true` if `/status` returned 200, `false` otherwise
- `hook_active`: `true` if a `hook_events` row with `ts > now - 5min` exists for this workspace — indicates hooks are actually firing (requires Feature 1). Fallback: check if `~/.claude/settings.json` contains `"fulcrum hook claude"` text
- `doctor_warnings`: array of `{ check: string, message: string }` for any doctor checks that fail at WARN/FAIL level. Run only the fast checks (skip DB migration check, skip model download check). Max 3 entries to keep response small.
- `suggested_next_call`: `"build_cos_context"` always for now (can be made dynamic later)

**Performance constraint**: The total time added by the readiness probe must be < 200ms. The monitor probe is a single HTTP GET with 200ms timeout. The doctor checks run a subset of fast checks only (no disk writes, no subprocess calls).

**outputSchema update**: Add `readiness` object to the tool's outputSchema in `mcp-tools.ts`.

### Acceptance Criteria

- [ ] `get_current_context` response always includes a `readiness` object
- [ ] `tools_available` reflects actual `TOOL_SCHEMAS.length`
- [ ] `monitor_running: true` when monitor is up, `false` when not — verified by test
- [ ] `hook_active: true` after at least one hook event has fired in the last 5 minutes
- [ ] `doctor_warnings` is an empty array when the environment is healthy
- [ ] Response time overhead < 200ms compared to current (measured in a timing test)
- [ ] `suggested_next_call` is `"build_cos_context"` in all cases

### Edge Cases

- **Monitor probe timeout**: Use `AbortSignal.timeout(200)` — never block longer than 200ms
- **`hook_events` table doesn't exist yet** (Feature 1 not deployed): Fall back to settings.json check for `hook_active`
- **Doctor checks throw**: Catch per-check; include failed checks in `doctor_warnings` as `{ check: 'unknown', message: err.message }`

### Smallest First Slice

1. Update `get_current_context` handler in `packages/cli/src/index.ts` to build and return `readiness`
2. Add `monitor_running` probe (HTTP GET /status with 200ms timeout)
3. Add `tools_available` (just `TOOL_SCHEMAS.length`)
4. Add `suggested_next_call: "build_cos_context"` static value
5. Defer `hook_active` and `doctor_warnings` to a follow-up (they depend on Feature 1 and add latency risk)

---

## Feature 7: Install-to-Value Checkpoint

### What it is

Two changes to `agent-integration/install.ts`:
1. Run `fulcrum doctor` as the final step and gate on any FAIL-level result
2. Write a seed task and memory entry after install completes, validating the DB write path and making the system non-empty immediately

### Behavior

**Doctor gate**:

At the end of `install.ts`, after all other steps succeed, add a new step "Verify installation":
```typescript
step('Verify installation', () => {
  const result = spawnSync('fulcrum', ['doctor', '--json'], { encoding: 'utf8' })
  const checks = JSON.parse(result.stdout) as Array<{ name: string; status: string; message: string }>
  const failures = checks.filter(c => c.status === 'fail')
  if (failures.length > 0) {
    fail(`${failures.length} check(s) failed:\n${failures.map(f => `  ${f.name}: ${f.message}`).join('\n')}`)
    console.log('\nRecovery steps:')
    for (const f of failures) console.log(`  - ${recoveryHintFor(f.name)}`)
  } else {
    ok(`All checks passed (${checks.length} total)`)
  }
})
```

**Bypass**: `--no-doctor-gate` flag or `FULCRUM_SETUP_NO_GATE=1` env var skips doctor gate (for CI, Docker).

**Seed write**:

After the doctor gate passes, add a step "Initialize workspace state":
```typescript
step('Initialize workspace state', async () => {
  // Dynamically import to avoid pulling core into the installer at load time
  const { createTask, writeMemory } = await import(...)
  
  await createTask({
    workspace_id: computedWorkspaceId,
    project_id: computedProjectId,
    title: 'Fulcrum setup complete',
    description: `Workspace initialized on ${new Date().toLocaleDateString()} by fulcrum setup`,
    status: 'done',
    metadata: { source: 'setup' },
  })
  
  await writeMemory({
    workspace_id: computedWorkspaceId,
    project_id: computedProjectId,
    kind: 'fact',
    title: 'Workspace initialized',
    content: `Fulcrum workspace initialized on ${new Date().toISOString()}. Setup completed successfully.`,
    importance: 0.3,
    source: 'setup',
    tags: ['setup', 'initialization'],
  })
  
  ok('Workspace seeded with initial task and memory')
})
```

**Tagging**: Both the task and memory must have `source: 'setup'` so they can be filtered from analytics and recall results if desired.

**Monitor entry**: Since the task is `status: 'completed'`, it shows in `fulcrum board show` and the monitor dashboard immediately.

### Acceptance Criteria

- [ ] After `pnpm run setup`, `fulcrum doctor` exits 0
- [ ] After `pnpm run setup`, `fulcrum task list` shows at least one task
- [ ] After `pnpm run setup`, `fulcrum memory recall --query "initialized"` returns at least one result
- [ ] If doctor gate fails (e.g., PATH not set up), setup prints recovery hints and exits non-zero
- [ ] `pnpm run setup -- --no-doctor-gate` bypasses the gate and exits 0 even if doctor would fail
- [ ] `FULCRUM_SETUP_NO_GATE=1 pnpm run setup` also bypasses
- [ ] Seed task and memory have `source: 'setup'` tag

### Edge Cases

- **Repeated setup runs** (idempotency): `createTask` with a `source: 'setup'` tag should check for an existing setup task before creating another. Add a guard: `if (!existingSetupTask) createTask(...)`.
- **DB not yet initialized when seed runs**: The doctor gate runs first; if it passes, the DB is confirmed working. The seed runs after.
- **`fulcrum` binary not in PATH yet**: Doctor gate will fail on the binary check — this is intentional. The PATH step runs before the gate.

### Smallest First Slice

1. Add "Verify installation" step to `install.ts` calling `fulcrum doctor --json`
2. Add `--no-doctor-gate` flag parsing
3. Add "Initialize workspace state" step writing one task + one memory
4. Guard idempotency: skip seed if `source: 'setup'` task already exists

---

## Cross-Cutting Notes

### Implementation Order

These 7 features form a dependency chain. Recommended order:

1. **Feature 4** (generate CLAUDE.md) — standalone, low risk, immediate trust fix
2. **Feature 1** (passive trace harvesting) — foundational; everything else becomes more visible
3. **Feature 3** (memory auto-write on completion) — the `source` column (m052) is introduced by Feature 3 itself, not Feature 1; can be parallelized with Feature 1
4. **Feature 7** (install checkpoint) — can be done independently; improves first-run experience
5. **Feature 6** (readiness object) — best after Feature 1 (`hook_active` field depends on it)
6. **Feature 5** (monitor auto-start) — low risk; enables Feature 6's `monitor_url`
7. **Feature 2** (npx bootstrap) — largest scope; benefits from 1-6 being solid first

### Shared New DB Migrations

- **m051**: `hook_events` table (Feature 1) — next after existing m050
- **m052**: `source` column on `memories` (Feature 3)

### Shared Env Vars

| Var | Feature | Default |
|-----|---------|---------|
| `FULCRUM_NO_AUTO_MEMORY` | 3 | unset (auto-write enabled) |
| `FULCRUM_NO_MONITOR` | 5 | unset (monitor auto-starts) |
| `FULCRUM_MONITOR_PORT` | 5 | 4721 |
| `FULCRUM_SETUP_NO_GATE` | 7 | unset (gate enabled) |

### Non-Goals

- This document does not cover session replay, hook telemetry pattern analysis, or MCP role switching — those are downstream brainstorms once the chain is fixed
- Feature 2 (npx) does not include a managed cloud/remote state option — state stays local
- Features do not change the agent protocol or MCP spec compliance
