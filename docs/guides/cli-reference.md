# CLI Reference

> Every `fulcrum` group, every subcommand, every flag.

This is the exhaustive reference for the `fulcrum` CLI. Every command below is implemented in `packages/cli/src/index.ts`; flag names and defaults come straight from the source. For an introductory tour, read the [installation guide](./installation.md) first.

---

## Top-level

```
fulcrum <group> <command> [options]
```

| Flag | Alias | Description |
|------|-------|-------------|
| `--help` | `-h` | Show top-level help, or `<group> --help` for group help |
| `--version` | `-v` | Print the Fulcrum CLI version and exit |
| `--json` | — | Switch list/get subcommands to JSON output instead of tab-separated rows |
| `--vault <path>` | — | Override the vault path (default: `~/.fulcrum/vault`) |
| `--port <n>` | — | Override the monitor port (default: `4721` from `.fulcrum.json`) |

### `--json` output

Almost every `list`, `get`, `status`, and `show` command respects `--json` and emits a fully-serialised JSON blob instead of the tab-separated table. Example:

```bash
fulcrum task list --json
# → [ { "task_id": "...", "display_id": "T-0001", "title": "...", "status": "queued", ... }, ... ]
```

### Auto-initialization

Every `fulcrum` command (except `--version`) first runs `ensureProjectInitialized()`, which:

1. Creates `$CWD/.fulcrum/fulcrum.db` and runs migrations.
2. Derives a deterministic `workspace_id` and `project_id` from `sha256(abs_path)[:12]` plus a sanitized basename.
3. Writes `$CWD/.fulcrum.json` with `{ workspace_id, project_id, monitor_port: 4721 }`.

You never run an explicit init step. The `hook` and `serve mcp` commands run this in silent mode so they never corrupt stdio traffic.

---

## `memory` — vault + L1 + L2

### `fulcrum memory init`

Run the interactive vault wizard. Creates L0 at `$FULCRUM_VAULT_PATH`, initialises L1 (SQLite FTS5), and optionally enables L2.

```bash
fulcrum memory init
```

Output: wizard prompts on stdout, success summary at the end.

### `fulcrum memory accelerate`

Enable the L2 layer (Kuzu graph + HNSW vector search) on an existing vault.

```bash
fulcrum memory accelerate
```

Output: `✓ L2 active — indexed <N> memories`, plus up to 10 error lines if anything failed.

### `fulcrum memory rebuild`

Rebuild derived layers from the L0 vault.

```
fulcrum memory rebuild [--l1 | --l2 | --both]
```

| Flag | Default | Rebuilds |
|------|---------|----------|
| `--l1` | yes | L1 SQLite FTS5 only |
| `--l2` | — | L2 Kuzu + HNSW only |
| `--both` | — | Both L1 and L2 |

```bash
fulcrum memory rebuild --both
```

Output: `✓ L1: <n> memories, L2: <n> memories` plus up to 10 errors.

### `fulcrum memory status`

Show vault path, L0 existence, L0 entry count, L1 readiness, and L2 activation.

```bash
fulcrum memory status
```

Output: five-line status block listing vault path and the state of L0/L1/L2.

---

## `serve` — MCP, monitor, combined

### `fulcrum serve mcp`

Start the stdio MCP compatibility server. Fulcrum is CLI-first, so canonical actions remain the primary execution contract; this command exposes a filtered MCP tool surface for runtimes that need MCP.

```
fulcrum serve mcp [planner flags] [--no-monitor]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--mode` | `filtered` | MCP exposure mode: `full`, `filtered`, or `minimal` |
| `--profile hook-only` | — | Compatibility shortcut for hook-capable runtimes |
| `--profile <role>` | — | Apply the role's `tools_allow` / `tools_deny` policy from `agent_definitions` |
| `--agent-type <role>` | — | Filter by action availability metadata for a specific agent type |
| `--platform <name>` | — | Filter by platform metadata |
| `--runtime-capability <cap>` | — | Add runtime capability facts such as `hooks` (repeatable) |
| `--include-action <name>` | — | Force-include a canonical action (repeatable) |
| `--exclude-action <name>` | — | Force-hide a canonical action (repeatable) |
| `--no-monitor` | — | Skip auto-starting the HTTP monitor alongside the MCP server |

```bash
fulcrum serve mcp                              # filtered MCP surface + monitor on :4721
fulcrum serve mcp --mode full                  # full MCP compatibility surface
fulcrum serve mcp --runtime-capability hooks   # hide hook-covered tools
fulcrum serve mcp --profile software_engineer  # role-gated surface
FULCRUM_NO_MONITOR=1 fulcrum serve mcp         # MCP only, no monitor
```

Runs until killed. Logs to stderr only (stdout is reserved for JSON-RPC).

Output: handshake response and tool-call results on stdout (JSON-RPC), status lines on stderr.

### `fulcrum serve mcp-http`

Start the HTTP MCP compatibility server using StreamableHTTP. It uses the same planner-driven exposure model as `serve mcp`.

```
fulcrum serve mcp-http [planner flags] [--port <n>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--mode` | `filtered` | MCP exposure mode: `full`, `filtered`, or `minimal` |
| `--profile <value>` | — | Role / compatibility shortcut input to the exposure planner |
| `--agent-type <role>` | — | Filter by action availability metadata |
| `--platform <name>` | — | Filter by platform metadata |
| `--runtime-capability <cap>` | — | Add runtime capability facts such as `hooks` (repeatable) |
| `--include-action <name>` | — | Force-include a canonical action (repeatable) |
| `--exclude-action <name>` | — | Force-hide a canonical action (repeatable) |
| `--port` | `4722` | HTTP port for the `/mcp` endpoint |

```bash
fulcrum serve mcp-http
fulcrum serve mcp-http --mode minimal --agent-type software_engineer
fulcrum serve mcp-http --mode filtered --runtime-capability hooks --port 4800
```

### `fulcrum mcp plan`

Show the exact MCP exposure decisions for a runtime/agent before starting a server.

```
fulcrum mcp plan [planner flags] [--json]
```

```bash
fulcrum mcp plan --runtime-capability hooks
fulcrum mcp plan --mode minimal --agent-type software_engineer --json
```

### `fulcrum serve monitor`

Start the HTTP monitor server with a status UI and control API.

```
fulcrum serve monitor [--port <n>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `4721` | HTTP port; overrides `.fulcrum.json` `monitor_port` |

```bash
fulcrum serve monitor --port 4721
```

Output: `[fulcrum monitor] Listening on http://127.0.0.1:<port>` on stdout; runs until killed.

### `fulcrum serve all`

Start the monitor in-process and the MCP server on stdio. Use this when you want a single launcher for Claude's MCP integration plus a local dashboard.

```bash
fulcrum serve all
```

Output: monitor startup line on stderr followed by MCP JSON-RPC on stdout.

---

## `hook` — PreToolUse / BeforeTool hooks

Each hook reads a JSON event from stdin, normalises it to Fulcrum's internal shape, logs an `hook_executed` event, runs a policy check, then exits `0` (allow) or `2` (deny).

### `fulcrum hook claude`

PreToolUse hook for Claude Code. Registered automatically by `pnpm run setup` via a merge into `~/.claude/settings.json`.

```bash
fulcrum hook claude < event.json
```

### `fulcrum hook gemini`

BeforeTool hook for Gemini CLI. Registered automatically via the Gemini extension at `~/.gemini/extensions/fulcrum/`.

```bash
fulcrum hook gemini < event.json
```

### `fulcrum hook pi|opencode|cursor|windsurf|copilot`

Tool hooks for PI, opencode, Cursor, Windsurf, and GitHub Copilot CLI.

```bash
fulcrum hook pi < event.json
fulcrum hook copilot --event pre_tool_use < event.json
```

PI extracts `role` and `runId` from the event for tighter policy enforcement on team-invocation tool calls. Copilot, Cursor, and Windsurf generated configs use `--event <name>` forms that map back to Fulcrum hook phases.

### `fulcrum hook auto`

Auto-detect the agent runtime from environment variables and dispatch to the correct hook handler. Used in the universal PreToolUse hook entry written by `npx fulcrum-mcp init`.

```bash
fulcrum hook auto < event.json
# Dispatches to the supported runtime based on event shape or environment
```

---

## `workspaces` — workspace CRUD

### `fulcrum workspaces list`

```bash
fulcrum workspaces list
```

Output: `<workspace_id>  <name>  (<status>)` per row, or `No workspaces found.`

### `fulcrum workspaces create`

```
fulcrum workspaces create --name <name> [--id <id>]
```

| Flag | Default | Required |
|------|---------|----------|
| `--name` | — | yes |
| `--id` | auto-generated | no |

```bash
fulcrum workspaces create --name "my-team"
```

Output: `Created workspace: <workspace_id>  (<name>)`.

---

## `projects` — project CRUD

### `fulcrum projects list`

```
fulcrum projects list [--workspace-id <id>]
```

```bash
fulcrum projects list --workspace-id ws_1
```

Output: `<project_id>  <name>  type:<type>  status:<status>  ws:<workspace_id>` per row.

### `fulcrum projects create`

```
fulcrum projects create --name <name> --workspace-id <id> [--type <type>] [--id <id>]
```

| Flag | Default | Required |
|------|---------|----------|
| `--name` | — | yes |
| `--workspace-id` | — | yes |
| `--type` | — | no |
| `--id` | auto-generated | no |

```bash
fulcrum projects create --name "Platform" --workspace-id ws_1 --type software
```

Output: `Created project: <project_id>  (<name>) in workspace <workspace_id>`.

---

## `task` — task CRUD

### `fulcrum task list`

```
fulcrum task list [--workspace-id <id>] [--project-id <id>] [--status <status>] [--limit <n>]
```

| Flag | Default | Notes |
|------|---------|-------|
| `--workspace-id` | current project | |
| `--project-id` | — | |
| `--status` | — | One of `queued`, `running`, `blocked`, `completed`, … |
| `--limit` | `50` | Truncates the result set |

```bash
fulcrum task list --status running --limit 20
fulcrum task list --json
```

Output: rows of `{task_id, display_id, title, status, priority, assigned_to}`.

### `fulcrum task get`

```
fulcrum task get --id <task_id>
```

```bash
fulcrum task get --id task_abc
```

Output: full task row as key/value lines (or JSON with `--json`).

### `fulcrum task create`

```
fulcrum task create --title <t> [--workspace-id <id>] [--project-id <id>] [--description <d>] [--priority <p>] [--assigned-to <role>]
```

| Flag | Default |
|------|---------|
| `--title` | — (required) |
| `--workspace-id` | auto-init workspace |
| `--project-id` | auto-init project |
| `--description` | — |
| `--priority` | `medium` (via core default) |
| `--assigned-to` | — |

```bash
fulcrum task create --title "Wire up auth" --priority high --assigned-to software_engineer
```

Output: `{task_id, display_id, title, status, priority}`.

### `fulcrum task update`

```
fulcrum task update --id <task_id> [--status <s>] [--note <n>] [--assigned-to <role>]
```

```bash
fulcrum task update --id task_abc --status completed --note "shipped"
```

Output: `{task_id, status, note, assigned_to}`.

---

## `issue` — issue CRUD (from `fulcrum-planning`)

### `fulcrum issue list`

```
fulcrum issue list [--workspace-id <id>] [--project-id <id>] [--status <s>]
```

```bash
fulcrum issue list --status open
```

Output: rows of `{issue_id, display_id, title, status, priority}`.

### `fulcrum issue create`

```
fulcrum issue create --title <t> [--workspace-id <id>] [--project-id <id>] [--description <d>] [--priority <p>]
```

```bash
fulcrum issue create --title "Login fails on Safari" --priority high
```

Output: `{issue_id, display_id, title, status}`.

### `fulcrum issue get`

```
fulcrum issue get --id <issue_id>
```

Output: full issue row.

### `fulcrum issue update`

```
fulcrum issue update --id <issue_id> [--status <s>] [--title <t>] [--expected-version <n>]
```

| Flag | Default |
|------|---------|
| `--expected-version` | `0` (fail if row version doesn't match) |

```bash
fulcrum issue update --id issue_abc --status in_progress --expected-version 1
```

Output: `{issue_id, status, title, version}`.

---

## `epic` — epic CRUD (from `fulcrum-planning`)

### `fulcrum epic list`

```
fulcrum epic list [--workspace-id <id>] [--project-id <id>]
```

```bash
fulcrum epic list
```

Output: rows of `{epic_id, display_id, title, status, priority}`.

### `fulcrum epic create`

```
fulcrum epic create --title <t> [--workspace-id <id>] [--project-id <id>] [--description <d>] [--priority <p>]
```

```bash
fulcrum epic create --title "Billing v2" --priority high
```

Output: `{epic_id, display_id, title, status}`.

### `fulcrum epic get`

```
fulcrum epic get --id <epic_id>
```

Output: full epic row.

---

## `board` — kanban view

### `fulcrum board show`

```
fulcrum board show [--workspace-id <id>] [--project-id <id>]
```

```bash
fulcrum board show
fulcrum board show --json
```

Output: four sections (`BACKLOG`, `ACTIVE`, `BLOCKED`, `DONE`) with `<display_id>  <status>  <title>` per row. With `--json`, emits `{ backlog: [...], active: [...], blocked: [...], done: [...] }`.

---

## `queue` — merge + review queues

### `fulcrum queue merge list`

List worktrees waiting for integration (status `ready_for_merge` or `conflict`).

```
fulcrum queue merge list [--workspace-id <id>]
```

```bash
fulcrum queue merge list
```

Output: rows of `{worktree_id, branch_name, status, project_id, updated_at}`.

### `fulcrum queue merge process`

Drain the merge queue. Delegates to `fulcrum-worktrees.processMergeQueue`.

```
fulcrum queue merge process --actor-role <role> [--workspace-id <id>] [--project-id <id>]
```

| Flag | Default | Required |
|------|---------|----------|
| `--actor-role` | — | yes |
| `--workspace-id` | current | no |
| `--project-id` | current | no |

```bash
fulcrum queue merge process --actor-role integration_worker
```

Output: `{merged, skipped, conflicts, results: [...]}`.

### `fulcrum queue review list`

List review-summary artifacts pending reviewer action.

```
fulcrum queue review list [--workspace-id <id>] [--project-id <id>]
```

```bash
fulcrum queue review list
```

Output: up to 50 rows of `{artifact_id, display_id, title, artifact_type, status, file_path, updated_at}`.

---

## `sync` — Plane bidirectional sync

### `fulcrum sync status`

```
fulcrum sync status [--workspace-id <id>]
```

```bash
fulcrum sync status
```

Output: per-object-type counts grouped by sync_status, plus an unresolved conflicts count.

### `fulcrum sync push`

Push queued local changes to Plane via `syncAll`.

```
fulcrum sync push [--workspace-id <id>] [--object-type <type>]
```

```bash
fulcrum sync push --object-type task
```

Output: full sync result object.

### `fulcrum sync pull`

Runs `syncAll` without an object-type filter. Plane integration is push-based — this call reconciles both directions on the queued objects.

```
fulcrum sync pull [--workspace-id <id>]
```

```bash
fulcrum sync pull
```

Output: full sync result object.

---

## `team` — team templates and instances (`fulcrum-teams`)

### `fulcrum team list`

```
fulcrum team list [--workspace-id <id>]
```

Output: rows of `{template_id, name, description, created_at}` from `team_templates`.

### `fulcrum team create`

```
fulcrum team create --name <name> [--description <d>]
```

```bash
fulcrum team create --name "research-pod"
```

Output: `{template_id, name}`. Note: the CLI creates an empty-slot template; use the TypeScript API to add slots.

### `fulcrum team invoke`

Invoke a template to create a running team instance.

```
fulcrum team invoke --template-id <id> --caller-role <role> [--workspace-id <id>] [--project-id <id>] [--purpose <p>] [--goal <g>] [--caller-agent-id <id>]
```

| Flag | Default |
|------|---------|
| `--template-id` | — (required) |
| `--caller-role` | — (required; must pass `canInvokeTeams`) |
| `--purpose` / `--goal` | `cli-invoked` |
| `--caller-agent-id` | `cli/<caller-role>` |

```bash
fulcrum team invoke --template-id tmpl_1 --caller-role chief_of_staff --goal "research spike"
```

Output: `{instance_id, display_id, status}`.

### `fulcrum team instances`

```
fulcrum team instances [--workspace-id <id>] [--project-id <id>]
```

Output: rows of `{instance_id, display_id, template_id, status, purpose}`.

---

## `workflow` — workflow engine (`fulcrum-workflows`)

For writing workflow definitions, see the [workflow authoring guide](./workflow-authoring.md).

### `fulcrum workflow list`

```
fulcrum workflow list [--workspace-id <id>]
```

Output: rows of `{name, version, steps, description}` from the registry.

### `fulcrum workflow start`

Create a new `workflow_runs` row from a registered workflow name.

```
fulcrum workflow start --workflow-name <n> [--workspace-id <id>] [--project-id <id>]
```

```bash
fulcrum workflow start --workflow-name implement_feature
```

Output: `{wf_id, display_id, status}`.

### `fulcrum workflow run`

Drive an existing run to termination via the runner loop.

```
fulcrum workflow run --wf-id <id> [--workspace-id <id>]
```

```bash
fulcrum workflow run --wf-id wf_abc
```

Output: `{wf_id, final_status, steps_executed, duration_ms}`.

### `fulcrum workflow status`

```
fulcrum workflow status --wf-id <id> [--workspace-id <id>]
```

Output: `{wf_id, display_id, status, current_step, workflow_name}`.

### `fulcrum workflow resume`

Resume a paused or blocked run.

```
fulcrum workflow resume --wf-id <id> [--workspace-id <id>] [--step-id <s>]
```

```bash
fulcrum workflow resume --wf-id wf_abc
```

Output: `{wf_id, status}`.

---

## `agent` — agent runs (`fulcrum-worker`)

For adapter authoring, see the [worker adapters guide](./worker-adapters.md).

### `fulcrum agent list`

```
fulcrum agent list [--workspace-id <id>]
```

Output: up to 50 rows of `{run_id, role, status, task_id, current_step, progress_pct, started_at}`.

### `fulcrum agent status`

```
fulcrum agent status --run-id <id>
```

```bash
fulcrum agent status --run-id run_abc
```

Output: `{run_id, status, role, task_id, current_step, progress_pct}`.

### `fulcrum agent spawn`

Spawn a subordinate agent. Policy-gated on `canInvokeTeams(caller_role)`.

```
fulcrum agent spawn --target-role <role> --caller-role <role> --task-id <id> [--workspace-id <id>] [--project-id <id>] [--adapter <name>]
```

| Flag | Default |
|------|---------|
| `--target-role` | — (required) |
| `--caller-role` | — (required; must be L1) |
| `--task-id` | — (required) |
| `--adapter` | `FULCRUM_AGENT_ADAPTER` env, or `stub` |

```bash
fulcrum agent spawn --target-role software_engineer --caller-role chief_of_staff --task-id task_abc
fulcrum agent spawn --target-role reviewer --caller-role chief_of_staff --task-id task_abc --adapter subprocess
```

Output: `{run_id, status, summary}`.

---

## `tool` — direct tool registry access

Every MCP tool implementation lives in a shared registry (`packages/cli/src/tool-registry.ts`). The `tool` group exposes those implementations as first-class CLI commands — no live MCP server required. Useful for hooks, CI pipelines, and non-hook platforms (Gemini CLI, PI).

### `fulcrum tool list`

List all registered tools and their capabilities.

```
fulcrum tool list [--json]
```

```bash
fulcrum tool list
fulcrum tool list --json
```

Output (text): one row per tool — `<name>  readOnly:<bool>  hookEquivalent:<bool>  <description>`
Output (JSON): `[ { name, description, readOnly, hookEquivalent, destructive } ]`

### `fulcrum tool exec`

Invoke any tool handler directly. `workspace_id` and `project_id` default to cwd-derived values when omitted.

```
fulcrum tool exec <tool-name> [--json <payload>]
```

| Argument | Description |
|----------|-------------|
| `<tool-name>` | Exact tool name (e.g. `list_tasks`, `get_workspace_status`) |
| `--json <payload>` | JSON string of tool arguments. If omitted, reads from stdin |

```bash
# Read from --json flag
fulcrum tool exec list_tasks --json '{"status":"open","limit":5}'

# Read from stdin (pipe-friendly)
echo '{"title":"Implement auth","priority":"high"}' | fulcrum tool exec create_task

# workspace_id / project_id default from cwd — no need to supply them
fulcrum tool exec get_workspace_status
```

Output: JSON on stdout (same shape as the MCP tool response). Exit code `0` on success, `1` on error.

---

## `tui` — Cockpit terminal UI

### `fulcrum tui`

Launch a full-screen live terminal dashboard inside the running shell. Powered by Ink (React for terminals).

```bash
fulcrum tui
```

**Panes** (cycle with `Tab`):

| Pane | Contents |
|------|----------|
| Tasks | Kanban columns — backlog / active / blocked / done |
| Agents | Live agent run list with role, status, heartbeat lag, task title |
| Events | Real-time SSE event feed |
| Policy | Recent policy violations and blocked runs |

**Key bindings:**

| Key | Action |
|-----|--------|
| `Tab` | Cycle panes |
| `↑ / ↓` | Move selection |
| `Enter` | Open/close selected item detail |
| `u` | Unblock selected agent run |
| `k` | Kill (abort) selected agent run |
| `n` | Create new task (opens inline input) |
| `d` | Mark selected task done |
| `q` | Quit |

Requires the monitor to be running (`fulcrum serve monitor`) for live SSE data and mutation actions. Falls back to direct DB reads (read-only) when the monitor is unreachable.

When monitor auth is required, set `FULCRUM_MONITOR_TOKEN` so mutation actions (`u`, `k`, `n`, `d`) can send the bearer token.

---

## `log` — Activity event feed

### `fulcrum log`

Show recent workspace activity events from the database, or tail the live SSE stream.

```
fulcrum log [--follow] [--since <duration>] [--run-id <id>] [--limit <n>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--follow` | off | Tail the live SSE stream from the monitor (requires `fulcrum serve monitor`) |
| `--since` | — | Filter events from this far back (`30m`, `2h`, `1d`) |
| `--run-id` | — | Filter to a single agent run |
| `--limit` | `50` | Number of events to show (non-follow mode) |

```bash
fulcrum log                   # last 50 events from DB
fulcrum log --follow          # tail live SSE stream
fulcrum log --since 1h        # last hour from DB
fulcrum log --follow --since 30m   # live stream, skip events older than 30m
fulcrum log --run-id run_abc  # single run history
```

Default (no `--follow`): reads the last N events from the database. Falls back to DB polling if `--follow` is requested but the monitor is unreachable.

Output format: `[HH:mm:ss] <role> <verb> <noun> — <detail>`

---

## `doctor` — Health check

### `fulcrum doctor`

Run environment and configuration health checks. Checks performed:

| Check | What it verifies |
|-------|-----------------|
| Node.js version | ≥ 20 required |
| Global config | `$FULCRUM_DATA_DIR/config.json` is valid JSON if present |
| Data directory | `~/.local/share/fulcrum/` (or `$FULCRUM_DATA_DIR`) exists |
| `better-sqlite3` | Native module loads correctly |
| Database liveness | INSERT + DELETE round-trip on the global DB |
| Hook events writable | `hook_events` table accepts writes |
| `@modelcontextprotocol/sdk` | MCP SDK loads correctly |
| Environment variables | Reports which of `FULCRUM_DATA_DIR`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` are set |
| Agent integration files | `CLAUDE.md`, `AGENTS.md`, or `GEMINI.md` exists in CWD |
| Monitor token | `$FULCRUM_DATA_DIR/token` file existence |
| Optional peer deps | `kuzu`, `sqlite-vec` for L2 graph/vector search |

```bash
fulcrum doctor
fulcrum doctor --json    # machine-readable output
```

Output: `✓ / ✗ / ⚠` marker per check with a one-line description.

### `fulcrum doctor --fix`

Run the same checks and apply automated fixes where available.

```bash
fulcrum doctor --fix
fulcrum doctor --fix --dry-run    # show what would be fixed without writing
```

Fixable items:

- **Data directory missing** → creates `$FULCRUM_DATA_DIR`
- **No agent integration files in CWD** → writes a stub `CLAUDE.md` in the current directory

---

## Putting it together

A realistic end-to-end session:

```bash
# First time in a repo — everything auto-inits
cd ~/code/my-project
fulcrum task list                              # creates .fulcrum/

# Start the monitor + MCP together
fulcrum serve all &
# Web dashboard: http://localhost:4721

# Open the terminal cockpit
fulcrum tui

# Watch live events
fulcrum log --since 30m

# Plan some work
fulcrum epic create --title "Billing v2"
fulcrum issue create --title "Idempotent charges" --priority high
fulcrum task create --title "Add idempotency key" --assigned-to software_engineer

# See the board
fulcrum board show

# Run a workflow
fulcrum workflow start --workflow-name implement_feature
fulcrum workflow run --wf-id wf_abc

# Or spawn a one-off agent
fulcrum agent spawn --target-role software_engineer --caller-role chief_of_staff --task-id task_abc

# Drive the merge queue
fulcrum queue merge process --actor-role integration_worker

# Mirror state to Plane
fulcrum sync push

# Health check + auto-fix
fulcrum doctor --fix
```

---

## Related

- [README.md](../../README.md) — top-level overview
- [installation.md](./installation.md) — install, setup, environment variables
- [workflow-authoring.md](./workflow-authoring.md) — writing workflows that `workflow run` can execute
- [worker-adapters.md](./worker-adapters.md) — registering a custom adapter for `agent spawn`
- [telemetry.md](./telemetry.md) — spans, OTLP export, manual instrumentation
