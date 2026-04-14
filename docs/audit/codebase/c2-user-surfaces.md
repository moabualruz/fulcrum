# C2 — User-facing Surfaces Trace

> Companion to C1 (static catalog). This document traces **runtime** behaviour:
> exactly what happens when a user runs `pnpm run setup`, types a `fulcrum`
> command, triggers a Claude Code hook, or drives a workflow to completion.
> Every section quotes code from the actual source tree as of the current
> branch; line numbers refer to the files in `/home/mkh/workspace/pi-stack-plan/`.

Navigation:
- [1. `pnpm run setup` step by step](#1-pnpm-run-setup-step-by-step)
- [2. CLI command dispatch (14 groups)](#2-cli-command-dispatch-14-groups)
- [3. MCP tool dispatch (18 tools)](#3-mcp-tool-dispatch-18-tools)
- [4. Hook pipeline](#4-hook-pipeline)
- [5. Workflow runner loop](#5-workflow-runner-loop)
- [6. 29 step handlers](#6-29-step-handlers)
- [7. Worker spawn pipeline](#7-worker-spawn-pipeline)
- [8. Memory write pipeline](#8-memory-write-pipeline)
- [9. Memory recall pipeline](#9-memory-recall-pipeline)
- [10. Merge queue pipeline](#10-merge-queue-pipeline)
- [11. DB lifecycle + auto-init](#11-db-lifecycle--auto-init)
- [12. Configuration resolution](#12-configuration-resolution)
- [13. Telemetry pipeline](#13-telemetry-pipeline)
- [14. End-to-end user stories](#14-end-to-end-user-stories)

---

## 1. `pnpm run setup` step by step

Source: `agent-integration/install.ts` (780 lines). Invoked via
`pnpm run setup` / `pnpm setup:claude` / `pnpm setup:gemini` / `pnpm setup:pi`
/ `pnpm setup:check` / `pnpm setup:dry`.

The entry point `main()` (line 742) parses the target, runs a plan from
`plans: Record<Exclude<Target,"check">, Array<[string, () => void]>>` (line
656), then prints a summary. Each step runs through the wrapper:

```ts
function step(name: string, fn: () => void | Promise<void>): Promise<void> {
  console.log(`\n── ${name} ──────────────────────────────────`);
  currentStep = { name, status: "ok" };
  results.push(currentStep);
  return Promise.resolve()
    .then(fn)
    .catch((err: Error) => {
      fail(`${name}: ${err.message}`);
      if (currentStep) {
        currentStep.recovery = recoveryHintFor(name);
        if (currentStep.recovery) {
          console.log(`     → ${currentStep.recovery}`);
        }
      }
      // Continue the rest of the plan — earlier version aborted on first failure.
    })
```

Key invariant: **one step failing never aborts the plan**. Each step records
a recovery hint via `recoveryHintFor(name)` (line 136).

The `all` plan (line 657) runs **8 steps** in order:

1. `CLI symlink → ~/.local/bin/fulcrum` — `installCliBin()`
2. `Verify fulcrum in PATH` — `verifyCliInPath()`
3. `Claude Code: user-scope MCP server` — `installClaudeMcp()`
4. `Claude Code: PreToolUse hook` — `installClaudeHook()`
5. `Claude Code: global CLAUDE.md context` — `installClaudeContext()`
6. `Claude Code: skills → ~/.claude/skills/fulcrum/` — `installClaudeSkills()`
7. `Gemini CLI: user extension` — `installGeminiExtension()`
8. `PI: cockpit extension` — `installPiCockpit()`

### Step 1 — `installCliBin()` (line 163)

**What it writes:**  symlink at `~/.local/bin/fulcrum` → `<repo>/fulcrum` (a
wrapper shell script).

**Idempotency:** `fs.lstatSync(linkPath)` + `fs.unlinkSync` before creating
the symlink (lines 177–189). Re-runs always refresh it, handling the
three shapes (symlink, regular file, broken symlink).

**Failure recovery:**
`fix perms on ~/.local/bin, then: pnpm run setup:claude`.

**Dependency:** none — first step.

**PATH sensitivity:** After linking, it checks
`process.env["PATH"]?.split(":").includes(binDir)` (line 200) and prints
copy-pasteable snippets for bash/zsh/fish if not present.

### Step 2 — `verifyCliInPath()` (line 212)

Runs `spawnSync("fulcrum", ["--version"], ...)` and reports success or
warns `fulcrum did not resolve — reopen your shell after setup`. In
`DRY_RUN` mode it just prints what it would do. No files written.
Idempotent trivially (read-only). Depends on Step 1.

### Step 3 — `installClaudeMcp()` (line 235)

**Primary path** (when `claude` CLI is on PATH):

```ts
spawnSync("claude", ["mcp", "remove", "--scope", "user", "fulcrum"], { stdio: "ignore" });
const result = spawnSync(
  "claude",
  ["mcp", "add", "--scope", "user", "fulcrum", "--", "fulcrum", "serve", "mcp"],
  { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
);
```

**Fallback path** (when `claude` CLI is missing, or `add` failed): edit
`~/.claude.json` directly, inserting
`mcpServers.fulcrum = { command: "fulcrum", args: ["serve", "mcp"] }`.

**Idempotency:** the `remove` + `add` sequence is naturally idempotent; the
fallback path uses `readJson` → in-place mutate → `writeJson`.

**Recovery hint:** `manual: claude mcp add --scope user fulcrum -- fulcrum serve mcp`.

**Dependency:** requires `fulcrum` resolvable on PATH at _invocation_ time
(the MCP command string is `fulcrum serve mcp`).

### Step 4 — `installClaudeHook()` (line 286)

**What it writes:** merges into `~/.claude/settings.json`. Ensures both
`PreToolUse` and `PostToolUse` entries exist with `matcher: "*"`. Constants
at line 283:

```ts
const CLAUDE_PRE_COMMANDS  = ["fulcrum hook claude pre", "fulcrum hook claude"];
const CLAUDE_POST_COMMANDS = ["fulcrum hook claude post"];
```

Canonical commands pushed: `fulcrum hook claude pre` and
`fulcrum hook claude post`.

**Idempotency:** `ensureHook` (line 302) scans existing entries for any
`hooks.command` in `acceptedCommands`. If found, the function returns
`"present"` and no write happens. This lets the installer upgrade from the
legacy `fulcrum hook claude` command without duplicating entries.

**Recovery hint:** `edit ~/.claude/settings.json manually, see agent-integration/claude/settings-hooks-snippet.json`.

### Step 5 — `installClaudeContext()` (line 343)

**What it writes:** appends the content of
`agent-integration/claude/CLAUDE.md` to `~/.claude/CLAUDE.md`, wrapped in
markers:

```ts
const MARKER_START = "<!-- fulcrum:begin -->";
const MARKER_END   = "<!-- fulcrum:end -->";
```

**Idempotency:** any prior fulcrum section is stripped by regex
(line 362) before re-appending, so repeated runs update in place
regardless of where in the file the old marker sat. It also collapses
*multiple* prior fulcrum sections into one (line 364 diagnostic).

### Step 6 — `installClaudeSkills()` (line 385)

**What it writes:** copies every `*.md` file from
`agent-integration/skills/` into `~/.claude/skills/fulcrum/`. The
subdirectory namespace prevents collisions with other tools' skills.

**Idempotency:** `fs.copyFileSync` overwrites existing files; no
content-hash check is needed because the source is always the canonical
repo file.

### Step 7 — `installGeminiExtension()` (line 417)

**What it writes:** copies
`agent-integration/gemini/gemini-extension.json` and
`agent-integration/gemini/GEMINI.md` into `~/.gemini/extensions/fulcrum/`.

**Idempotency:** overwrite on copy.

### Step 8 — `installPiCockpit()` (line 441)

**What it writes:** runs `pi install <repo>/agent-integration/pi/cockpit`.

Skips with a warning if `pi` is not on PATH (line 444). The only step that
depends on an external CLI being installed.

### Check mode — `runCheck()` (line 473)

Invoked by `pnpm run setup:check`. Inspects all installed artefacts and
prints a coloured table. Per-row status: `ok` / `warn` / `fail`. Exit code
`0` only if no failures (warnings are tolerated).

Checks performed: fulcrum CLI symlink, PATH, Claude MCP, Claude hook
(both PreToolUse + PostToolUse), Claude context, Claude skills, Gemini
extension, PI cockpit.

---

## 2. CLI command dispatch (14 groups)

Source: `packages/cli/src/index.ts` (2211 lines). Entry point: `main()`
at line 2101. Dispatched groups: `memory, serve, hook, workspaces,
projects, task, issue, epic, board, queue, sync, team, workflow, agent`
— **14 total**.

### Dispatch logic

Top of file:

```ts
const [, , ...args] = process.argv
const [group, command] = args
```

In `main()` (line 2101):

```ts
if (group === '--version' || group === '-v' || group === 'version') {
  // reads packages/cli/package.json version, prints, returns
}

// Auto-initialize the project in $CWD (creates .fulcrum/fulcrum.db, default
// workspace + project, and .fulcrum.json) before dispatching any command
// that touches the DB.
const silentInit = group === 'hook' || (group === 'serve' && command === 'mcp')
await ensureProjectInitialized({ silent: silentInit })
```

`hook` and `serve mcp` pass `silent: true` so the init notice doesn't go
to stderr on every Claude tool call (would corrupt MCP stdio and spam the
hook stream).

Then the group dispatch:

```ts
if (group === 'memory')    { await runMemory();     return }
if (group === 'serve')     { /* mcp | monitor | all */ }
if (group === 'hook')      { /* claude | gemini | pi [pre|post] */ }
if (group === 'workspaces')    { await runWorkspaces();  return }
if (group === 'projects')      { await runProjects();    return }
if (group === 'task' || group === 'tasks')         { await runTasks();     return }
if (group === 'issue' || group === 'issues')       { await runIssues();    return }
if (group === 'epic' || group === 'epics')         { await runEpics();     return }
if (group === 'board')                             { await runBoard();     return }
if (group === 'queue')                             { await runQueue();     return }
if (group === 'sync')                              { await runSync();      return }
if (group === 'team' || group === 'teams')         { await runTeams();     return }
if (group === 'workflow' || group === 'workflows') { await runWorkflows(); return }
if (group === 'agent' || group === 'agents')       { await runAgent();     return }
```

### Lazy imports

Every group-handler function starts with `await import(...)` calls. For
example `runTasks` (line 1361):

```ts
export async function runTasks(): Promise<void> {
  const { listTasks, createTask, updateTask } = await import('@fulcrum/core')
  ...
}
```

This keeps cold-start cheap — e.g. `fulcrum task list` never pulls in
`@fulcrum/workflows` or `@fulcrum/worktrees`.

### Output: `outputRows` / `outputObject` (lines 118, 149)

Both check `args.includes('--json')` and dump JSON; otherwise tab-separated
table or `key: value` lines. Columns default to the keys of the first row.

### Per-group details

#### 2.1 `fulcrum memory`

Handler: `runMemory` (line 191). Subcommands: `init`, `accelerate`,
`rebuild`, `status`.

- `init` → `runMemoryInit()` from `@fulcrum/memory` — initializes L0 vault + L1 SQLite.
- `accelerate` → `activateL2()` — enables Kuzu graph + HNSW vector.
- `rebuild` → `rebuildFromVault({ vaultPath, target: 'l1'|'l2'|'both' })`.
- `status` → prints vault path + L0/L1/L2 presence.

Help text quoted:

```
fulcrum memory — memory vault commands

  init          Initialize vault (L0 + L1), optionally enable L2
  accelerate    Enable L2 graph + vector search on existing vault
  rebuild       Rebuild L1 SQLite from L0 vault files
  status        Show vault info
```

#### 2.2 `fulcrum serve`

Handler: inline dispatch in `main()`. Subcommands: `mcp`, `monitor`, `all`.

- `mcp` → `runServeMcp()` (line 593) — JSON-RPC stdio server with 18 tools.
- `monitor` → `runServeMonitor()` (line 1230) — HTTP monitor via
  `startMonitorServer({port, workspace_id})` from `@fulcrum/monitor`.
- `all` → `runServeAll()` (line 1259) — starts both (monitor in
  background, MCP on stdio).

All three call `getDb()` + `runMigrations(db)` + `warmEmbedding()` +
`warmOtel()` + `registerOtelShutdown()` before entering their main loop.

#### 2.3 `fulcrum hook`

Handler: `runHook(cliName, phase)` (line 467). Phases: `pre` (default) |
`post`. CLI targets: `claude`, `gemini`, `pi`.

Reads stdin → `JSON.parse` → `normalizeHookEvent(cliName, event)` →
`emitEvent({evt_type: 'hook_executed', ...})` → dispatches to
`runPreHook` or `runPostHook`. (See [§4](#4-hook-pipeline) for the
details.)

#### 2.4 `fulcrum workspaces`

Handler: `runWorkspaces` (line 1281). Subcommands: `list`, `create`.
Calls `listWorkspaces()` / `createWorkspace({name, workspace_id})` from
`@fulcrum/core`. Plain text output:
`${workspace_id}  ${name}  (${status})`.

Help text quoted:
```
fulcrum workspaces — workspace CRUD

  fulcrum workspaces list
  fulcrum workspaces create --name <name> [--id <id>]
```

#### 2.5 `fulcrum projects`

Handler: `runProjects` (line 1317). Subcommands: `list`, `create`.
`listProjects({workspace_id})` / `createProject({name, workspace_id, project_id, type})`.

#### 2.6 `fulcrum task`

Handler: `runTasks` (line 1361). Subcommands: `list`, `get`, `create`,
`update`. Lazy-imports `listTasks`, `createTask`, `updateTask` from
`@fulcrum/core`. Uses `outputRows`/`outputObject`, supports `--json`.

Column shape for `list`: `task_id, display_id, title, status, priority, assigned_to`.

Help:
```
fulcrum task — task CRUD

  fulcrum task list [--workspace-id <id>] [--project-id <id>] [--status <s>] [--limit <n>] [--json]
  fulcrum task get --id <task_id> [--json]
  fulcrum task create --title <title> [--workspace-id <id>] [--project-id <id>] [--description <d>] [--priority <p>] [--assigned-to <role>]
  fulcrum task update --id <task_id> [--status <s>] [--note <n>] [--assigned-to <role>]
```

Default workspace/project are sourced from `currentProjectIds()`
(line 2032) which returns the deterministic IDs set by
`ensureProjectInitialized()` if the user didn't pass
`--workspace-id` / `--project-id`.

#### 2.7 `fulcrum issue`

Handler: `runIssues` (line 1434). Lazy-imports `createIssue`,
`updateIssue`, `listIssues` from `@fulcrum/planning`. Subcommands:
`list`, `create`, `get`, `update`. The `update` path supports optimistic
concurrency via `--expected-version <n>` (passed to `updateIssue`).

#### 2.8 `fulcrum epic`

Handler: `runEpics` (line 1506). Lazy-imports `createEpic`, `listEpics`
from `@fulcrum/planning`. Subcommands: `list`, `create`, `get`.

#### 2.9 `fulcrum board`

Handler: `runBoard` (line 1564). Default subcommand `show`. Groups
`listTasks()` results by `status_category` (`backlog|active|blocked|done`)
and prints each group. With `--json` emits
`{ backlog: [...], active: [...], blocked: [...], done: [...] }`.

#### 2.10 `fulcrum queue`

Handler: `runQueue` (line 1609). Subcommand routing uses `args[2]` for
the 3-token forms `queue merge list`, `queue merge process`,
`queue review list`:

- `queue merge list` — direct SQL against `worktrees WHERE status IN ('ready_for_merge','conflict')`.
- `queue merge process --actor-role <role>` — lazy-imports
  `processMergeQueue` from `@fulcrum/worktrees` and passes
  `{ workspace_id, project_id, actor_role }`. Output has `merged`,
  `skipped`, `conflicts`, `results` counts (see [§10](#10-merge-queue-pipeline)).
- `queue review list` — SQL against
  `artifacts WHERE artifact_type = 'review_summary' ORDER BY updated_at DESC LIMIT 50`.

#### 2.11 `fulcrum sync`

Handler: `runSync` (line 1681). Lazy-imports `syncAll`, `listConflicts`
from `@fulcrum/sync`. Subcommands:

- `status` — SQL group-count against `sync_states` per `(object_type, sync_status)` + unresolved conflicts count.
- `push --object-type <type>` — calls `syncAll({workspace_id, object_type})`.
- `pull` — calls `syncAll({workspace_id})` (plane sync is push-based; pull is an alias that reconciles in both directions).

#### 2.12 `fulcrum team`

Handler: `runTeams` (line 1756). Lazy-imports `createTeamTemplate`,
`invokeTeam`, `listTeamInstances` from `@fulcrum/teams`. Subcommands:
`list`, `create`, `invoke`, `instances`.

Invoke form:
```
fulcrum team invoke --template-id <id> --workspace-id <id> --caller-role <role> [--goal <g> | --purpose <p>] [--project-id <id>] [--caller-agent-id <id>]
```

Note: `caller_role` is validated downstream via `canInvokeTeams` —
only `chief_of_staff` may successfully invoke teams.

#### 2.13 `fulcrum workflow`

Handler: `runWorkflows` (line 1837). Lazy-imports from `@fulcrum/workflows`:
`listWorkflows`, `startWorkflow`, `runWorkflow`, `getWorkflowRun`,
`resumeWorkflow`. Subcommands: `list`, `start`, `run`, `status`, `resume`.

`run` output is the `{ wf_id, final_status, steps_executed, duration_ms }`
record produced by `runWorkflow()` (see [§5](#5-workflow-runner-loop)).

#### 2.14 `fulcrum agent`

Handler: `runAgent` (line 1933). Subcommands:

- `list` — direct SQL:
  `SELECT run_id, role, status, task_id, current_step, progress_pct, started_at FROM agent_runs WHERE workspace_id = ? ORDER BY started_at DESC LIMIT 50`.
- `status --run-id <id>` — lazy-imports `getAgentRunStatus` from `@fulcrum/core`.
- `spawn --target-role --caller-role --task-id [--adapter]` — lazy-imports
  `spawnAgent` from `@fulcrum/worker`. Returns `{run_id, status, summary}`.

---

## 3. MCP tool dispatch (18 tools)

Source: `runServeMcp()` in `packages/cli/src/index.ts` lines 593–1228.

### Wire protocol

JSON-RPC 2.0 over stdio. `readline.createInterface({ input: process.stdin })`
reads line-delimited messages. Methods handled:

- `initialize` → returns `{protocolVersion: '2024-11-05', capabilities: {tools:{}}, serverInfo: {name:'fulcrum', version:'1.0.0'}}`
- `notifications/initialized` → no-op
- `tools/list` → returns the 18-tool `tools` array
- `tools/call` → opens an `mcp.tool` span, dispatches to `handleToolCall`, closes span
- `ping` → returns `{}`
- everything else → JSON-RPC error `-32601 Method not found`

Every `tools/call` is wrapped in a span:

```ts
const mcpSpan = await startSpan({
  name: 'mcp.tool',
  workspace_id: spanWorkspaceId,
  payload: { tool_name: toolName, request_id: String(id ?? '') },
})
try {
  const result = await handleToolCall(toolName, toolArgs)
  await endSpan({ span_id: mcpSpan.span_id, status: 'ok',
                  payload: { tool_name: toolName } })
  respond(id, { content: [{ type: 'text', text: JSON.stringify(result) }] })
} catch (err) {
  await endSpan({ span_id: mcpSpan.span_id, status: 'error',
                  payload: { error: (err as Error).message } })
  respond(id, { content: [{ type: 'text', text: JSON.stringify({ error: (err as Error).message }) }], isError: true })
}
```

Notice: errors are returned as `{isError: true}` tool responses, not
JSON-RPC errors — MCP clients treat these as tool failures rather than
protocol errors.

### Tool catalogue (18 tools)

| # | Name | Required | Handler → Core fn |
|---|---|---|---|
| 1 | `list_tasks` | `project_id, workspace_id` | `listTasks` |
| 2 | `create_task` | `title, project_id, workspace_id` | `ensureWorkspace/Project` + `createTask` |
| 3 | `update_task` | `task_id` | `updateTask` |
| 4 | `recall_memory` | `query, workspace_id, project_id` | `recallMemory` |
| 5 | `write_memory` | `content, workspace_id, project_id` | `ensureWorkspace/Project` + `writeMemory` |
| 6 | `list_agent_profiles` | (none) | `listAgentProfiles` |
| 7 | `get_agent_run_status` | `run_id` | `getAgentRunStatus` |
| 8 | `start_agent_run` | `agent_role, workspace_id` | `ensureWorkspace/Project` + auto-create stub task + `startAgentRun` |
| 9 | `heartbeat_agent_run` | `run_id, workspace_id` | `heartbeatAgentRun` |
| 10 | `complete_agent_run` | `run_id, workspace_id` | `completeAgentRun` |
| 11 | `block_agent_run` | `run_id, workspace_id, reason` | `blockAgentRun` |
| 12 | `build_cos_context` | `project_id, workspace_id` | `buildCosContext` |
| 13 | `get_workspace_status` | `workspace_id` | `getWorkspaceStatus` |
| 14 | `create_team_template` | `name, slots` | `getTeamOps().createTeamTemplate` |
| 15 | `invoke_team` | `template_id, workspace_id, purpose, caller_agent_id, caller_role` | `getTeamOps().invokeTeam` |
| 16 | `list_team_templates` | (none) | `getTeamOps().listTeamTemplates` |
| 17 | `list_team_instances` | `workspace_id` | `getTeamOps().listTeamInstances` |
| 18 | `create_agent_profile` | `workspace_id, name, description` | `createAgentProfile` |

### Selected schemas (verbatim from source)

**`create_task`** (line 644):

```ts
{
  name: 'create_task',
  description: 'Create a new task in the project.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      project_id: { type: 'string' },
      workspace_id: { type: 'string' },
      description: { type: 'string' },
      priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'none'] },
      assigned_to: { type: 'string' },
      done_criteria: { type: 'string' },
    },
    required: ['title', 'project_id', 'workspace_id'],
  },
},
```

**`recall_memory`** (line 674):

```ts
{
  name: 'recall_memory',
  description: 'Recall relevant memories from the project memory store by semantic query.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      workspace_id: { type: 'string' },
      project_id: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['query', 'workspace_id', 'project_id'],
  },
},
```

**`invoke_team`** (line 842):

```ts
{
  name: 'invoke_team',
  description: 'Instantiate a team from a template. Only chief_of_staff may invoke teams (enforced by canInvokeTeams).',
  inputSchema: {
    type: 'object',
    properties: {
      template_id: { type: 'string', description: 'Template to instantiate' },
      workspace_id: { type: 'string' },
      project_id: { type: 'string', description: 'Optional project scope' },
      purpose: { type: 'string', description: 'Why this team is being spawned' },
      task_id: { type: 'string', description: 'Optional originating task' },
      caller_agent_id: { type: 'string', description: 'Agent ID of the invoker' },
      caller_role: { type: 'string', description: 'Role of the invoker (must be chief_of_staff)' },
      initial_slots: { type: 'object', description: 'Optional initial slot → agent_id[] mapping' },
    },
    required: ['template_id', 'workspace_id', 'purpose', 'caller_agent_id', 'caller_role'],
  },
},
```

**`start_agent_run`** (line 725):

```ts
{
  name: 'start_agent_run',
  description: 'Register a PI agent run starting. Call at task start — returns run_id.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'Task ID (auto-creates stub if not found)' },
      agent_role: { type: 'string' },
      workspace_id: { type: 'string' },
      project_id: { type: 'string' },
      worktree_path: { type: 'string' },
      pi_run_id: { type: 'string', description: 'Optional custom run ID' },
    },
    required: ['agent_role', 'workspace_id'],
  },
},
```

### Dispatcher: `handleToolCall` (line 911)

A flat if-chain. Representative body for `start_agent_run`
(line 993) — note the "auto-create stub task" behaviour that makes this
tool safe to call with just `agent_role` + `workspace_id`:

```ts
if (name === 'start_agent_run') {
  const wsId = a['workspace_id'] as string
  const projId = (a['project_id'] as string | undefined) ?? wsId
  ensureWorkspace(wsId)
  ensureProject(wsId, projId)

  // Find or create task
  let task_id = a['task_id'] as string | undefined
  if (!task_id) {
    const stub = await createTask({ title: `[auto] ${a['agent_role']} run`, workspace_id: wsId, project_id: projId })
    task_id = stub.task_id
  } else {
    const existing = db.prepare('SELECT task_id FROM tasks WHERE task_id = ?').get(task_id)
    if (!existing) {
      const stub = await createTask({ title: `[auto] ${a['agent_role']} run`, workspace_id: wsId, project_id: projId })
      task_id = stub.task_id
    }
  }

  const role = a['agent_role'] as string
  const run = await startAgentRun({
    task_id,
    role: role as Parameters<typeof startAgentRun>[0]['role'],
    workspace_id: wsId,
    agent_id: `pi/${role}`,
    pi_profile: role,
  })
  return { run_id: run.run_id, status: run.status }
}
```

`ensureWorkspace` and `ensureProject` (lines 610 and 618) are
`INSERT OR IGNORE` wrappers that auto-create missing parent rows so any
Claude session can write against a fresh DB.

Error handling: any thrown error is caught by the `tools/call` wrapper
and returned as `{isError: true, content: [{type:'text', text:'{"error":"..."}'}]}`.

---

## 4. Hook pipeline

Source: `packages/cli/src/index.ts` lines 272–547.

### Event shapes

`normalizeHookEvent(cliName, event)` (line 289) handles three source shapes:

- **Claude Code**: `{ tool_name, tool_input, session_id }`
- **Gemini**: `{ tool_name|toolName, tool_input|toolInput|args, session_id|conversationId }`
- **PI**: `{ toolName, toolInput|args, sessionId, role, runId|run_id }` — PI is the only CLI that supplies `agentRole` and `runId`.

All three normalize into `NormalizedHookEvent`:

```ts
export interface NormalizedHookEvent {
  toolName: string
  toolInput: Record<string, unknown>
  sessionId: string
  agentRole: string
  runId: string
}
```

### Driver — `runHook(cliName, phase)` (line 467)

1. Guards `--help|-h|<missing>` → prints help and exits.
2. Reads `currentProjectIds()` for the auto-initialized workspace.
3. Reads all of stdin into a Buffer, JSON-parses it. Parse failure →
   `process.exit(0)` (fail-open).
4. Calls `normalizeHookEvent(cliName, event)`.
5. Emits a `hook_executed` event:

```ts
emitEvent({
  workspace_id,
  evt_type: 'hook_executed',
  object_type: 'tool_call',
  object_id: runId || undefined,
  actor_type: 'agent',
  actor_id: `${cliName}/${sessionId.slice(0, 8)}${runId ? ':' + runId.slice(-8) : ''}`,
  payload: {
    tool_name: toolName,
    tool_input_keys: Object.keys(toolInput),
    session_id: sessionId,
    run_id: runId || undefined,
    phase,
  },
})
```

6. Dispatches to `runPreHook(ctx, io)` or `runPostHook(ctx, io)`.

Both receive an `io` object with `stderr(msg)` and `exit(code)` so the
handlers are unit-testable (the test harness can supply spy functions).

### Pre-hook — `runPreHook(ctx, io)` (line 345)

Three phases, executed in order:

**Phase 1 — secret scan** (line 347):

```ts
const { checkSecrets } = await import('@fulcrum/policy')
const inputStr = JSON.stringify(ctx.toolInput)
const scan = checkSecrets(inputStr)
if (scan.has_secrets) {
  // emitEvent('policy_denied', {reason:'secret_scan_denied', patterns, phase:'pre'})
  io.stderr(`[fulcrum/pre] Tool call denied: secret detected in tool_input (${patterns.join(', ')})\n`)
  io.stderr(`[fulcrum/pre] Never include credentials in tool inputs. Use env vars or a secret store.\n`)
  io.exit(2)   // hard deny
  return
}
```

Exit 2 is the hard-deny signal Claude Code honours.

**Phase 2 — team-invoke policy** (line 378):

```ts
const isTeamInvoke = ctx.toolName.includes('invoke_team') || ctx.toolName.includes('team_invoke')
if (isTeamInvoke && ctx.agentRole) {
  const { canInvokeTeams } = await import('@fulcrum/core')
  if (!canInvokeTeams(ctx.agentRole as AgentRole)) {
    io.stderr(`[fulcrum/pre] Tool call denied: role '${ctx.agentRole}' lacks can_invoke_teams\n`)
    io.exit(2)
    return
  }
}
```

Only fires if the event included an `agentRole` (i.e. only PI today).
Claude Code doesn't self-report its role, so this phase is effectively a
no-op for Claude and the enforcement happens inside the MCP tool handler.

**Phase 3 — memory recall** (line 393):

```ts
const HOOK_WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash'])

if (HOOK_WRITE_TOOLS.has(ctx.toolName) && ctx.runId) {
  const { getDb } = await import('@fulcrum/core')
  const db = getDb()
  const runRow = db.prepare(
    `SELECT task_id, project_id FROM agent_runs WHERE run_id = ? AND workspace_id = ?`
  ).get(ctx.runId, ctx.workspace_id) as { task_id: string | null; project_id: string | null } | undefined
  if (runRow?.task_id) {
    const rows = db.prepare(
      `SELECT memory_id, kind, content FROM memories
       WHERE workspace_id = ? AND task_id = ?
         AND kind IN ('task_goal','task_decision','decision','lesson','task_outcome')
       ORDER BY importance DESC, created_at DESC LIMIT 3`
    ).all(ctx.workspace_id, runRow.task_id) as Array<{ memory_id: string; kind: string; content: string }>
    if (rows.length > 0) {
      io.stderr(`[fulcrum/pre] recalled ${rows.length} task memories:\n`)
      for (const r of rows) {
        const summary = r.content.slice(0, 200).replace(/\s+/g, ' ')
        io.stderr(`[fulcrum/pre]   ${r.kind}: ${summary}\n`)
      }
    }
  }
}
```

Recall uses a **direct task_id query** — not FTS5 MATCH — because the
goal is "all the context for this task" not "keyword match". Scoped to
write-family tools only: `Write, Edit, MultiEdit, NotebookEdit, Bash`.
Strictly non-blocking: any DB failure is swallowed.

Terminates with `io.exit(0)` (line 419).

### Post-hook — `runPostHook(ctx, io)` (line 427)

```ts
if (!ctx.runId) { io.exit(0); return }

const { getDb, writeMemory } = await import('@fulcrum/core')
const db = getDb()
const runRow = db.prepare(
  `SELECT task_id, project_id FROM agent_runs WHERE run_id = ? AND workspace_id = ?`
).get(ctx.runId, ctx.workspace_id) as { task_id: string | null; project_id: string | null } | undefined

// Redact: only log the *keys* of tool_input, never the values.
const tool_input_keys = Object.keys(ctx.toolInput).slice(0, 20)
const content = [
  `Tool: ${ctx.toolName}`,
  `Keys: ${tool_input_keys.join(', ') || '(none)'}`,
  `Session: ${ctx.sessionId}`,
  `Run: ${ctx.runId}`,
].join('\n')

await writeMemory({
  workspace_id: ctx.workspace_id,
  project_id: runRow?.project_id ?? ctx.workspace_id,
  task_id: runRow?.task_id ?? undefined,
  content,
  kind: 'tool_trace',
  scope: runRow?.task_id ? 'task' : 'project',
  tags: [ctx.toolName, ctx.cliName],
  importance: 0.2,
})
```

**Key invariant: never re-log secrets.** Only the *keys* of `tool_input`
are written, never their values. The comment on line 442 is explicit.

Any writeMemory failure is caught and printed to stderr, then
`io.exit(0)` — the post-hook never blocks tool execution.

### Exit code / stderr conventions

- `exit(0)` → allow the tool call to proceed (all phases pass, or the
  hook had nothing useful to say).
- `exit(2)` → hard deny (secret scan or team-invoke policy).
- stderr lines are `[fulcrum/pre]` or `[fulcrum/post]` prefixed so Claude
  Code surfaces them next to the denied tool call.

---

## 5. Workflow runner loop

Source: `packages/workflows/src/runner.ts` (393 lines). Entry:
`runWorkflow(input: RunWorkflowInput)` at line 182.

### Defaults

```ts
const DEFAULT_MAX_ITERATIONS = 1000
const DEFAULT_STEP_TIMEOUT_MS = 600_000
const DEFAULT_RETRY_COUNT = 3
const PRODUCTION_BACKOFF_CAP_MS = 30_000
```

Tests override `retry_backoff_cap_ms` via `RunWorkflowInput` so they
don't sleep 30s on retry.

### Loading

`loadRun(wf_id, workspace_id)` at line 89 reads
`workflow_runs WHERE wf_id = ? AND workspace_id = ?`, parses the `steps`
JSON column. Two shapes are tolerated:

- Legacy: bare array of `WorkflowStepState[]`; defs fetched from the
  registry by `workflow_name`.
- Modern: `{ states: [...], defs: [...] }` combined blob.

### Persisting

`persistStates(wf_id, states, defs, status?, current_step_id?)` at line
133 atomically updates:

```sql
UPDATE workflow_runs
SET steps = ?, status = ?, status_category = ?,
    current_step_id = ?,
    completed_at = COALESCE(completed_at, ?),
    version = version + 1, updated_at = ?
WHERE wf_id = ?
```

`status_category` is computed from `status`:
- `completed|cancelled` → `done`
- `failed|blocked` → `blocked`
- otherwise → `active`

### Main loop (lines 215–340)

```ts
const runSpan = await startSpan({
  name: 'workflow.run',
  workspace_id,
  payload: { wf_id: input.wf_id },
})

// Hydrate outputs from any prior completed steps.
const outputs: Record<string, unknown> = {}
for (const s of states) {
  if (s.status === 'completed' && s.result !== undefined) {
    outputs[s.step_id] = s.result
  }
}

for (let iter = 0; iter < maxIter && !haltRequested; iter++) {
  const ready = nextReadySteps(states, step_defs)
  if (ready.length === 0) break
  let progressed = false

  for (const step_id of ready) {
    // ...open per-step span, invoke executeStep(ctx) with timeout race...
    const stepSpan = await startSpan({
      name: 'workflow.step',
      workspace_id,
      parent_span_id: runSpan.span_id,
      payload: { step_id, step_type: ..., attempts: state.attempts },
    })

    let result: StepResult
    try {
      const stepTimeout = (def as any).timeout_ms ?? defaultTimeout
      result = await withTimeout(executeStep(ctx), stepTimeout)
    } catch (err) {
      result = { status: 'failed', error: (err as Error).message }
    }
    await endSpan({ span_id: stepSpan.span_id,
                    status: result.status === 'failed' ? 'error' : 'ok',
                    payload: { result_status: result.status, error: result.error } })
    state.attempts += 1
    // ...classify: completed / skipped / failed → retry → fail...
  }
}
```

### Classification

**`completed`** → mark `state.status='completed'`, record
`state.result = result.output`, persist, check halt short-circuit:

```ts
if (
  (def as any).step_type === 'halt' ||
  (result.output && typeof result.output === 'object' && (result.output as { halt?: boolean }).halt)
) {
  haltRequested = true
  break
}
```

**`skipped`** → the step is "not ready yet, try again next iteration".
`state.status = 'pending'`, `progressed = true` (so the outer loop
re-iterates). `loop` and `branch` handlers use this to converge over
repeated polling.

**`failed`** → retry if `state.attempts < maxRetries`:

```ts
state.status = 'retrying'
persistStates(input.wf_id, states, step_defs, undefined, lastCurrentStep)
const delay = getBackoffMs(state.attempts, backoffCap)  // 1s, 2s, 4s, 8s, capped
if (delay > 0) await new Promise(r => setTimeout(r, delay))
state.status = 'pending'
progressed = true
```

Else → terminal failure, `finalStatus = 'failed'`, `haltRequested = true`,
break.

### Stall detector (line 333)

```ts
// If every ready step in this pass returned 'skipped', we've stalled
// — break out rather than loop forever waiting for external events.
if (!progressed && !haltRequested) {
  if (!states.some((s) => s.status === 'retrying')) {
    break
  }
}
```

### Terminal status (lines 343–365)

```ts
const allTerminal = states.every(s => s.status === 'completed' || s.status === 'skipped' || s.status === 'failed')
const anyFailed   = states.some(s => s.status === 'failed')
const anyPending  = states.some(s => s.status === 'pending')

let dbStatus: string
if (anyFailed)                { dbStatus = 'failed';    finalStatus = 'failed' }
else if (haltRequested && !anyFailed) { dbStatus = 'completed'; finalStatus = 'completed' }
else if (allTerminal)         { dbStatus = 'completed'; finalStatus = 'completed' }
else if (anyPending)          { dbStatus = 'blocked';   finalStatus = 'blocked' }
else                          { dbStatus = 'completed'; finalStatus = 'completed' }

persistStates(input.wf_id, states, step_defs, dbStatus, lastCurrentStep)

await endSpan({ span_id: runSpan.span_id,
                status: finalStatus === 'failed' ? 'error' : 'ok',
                payload: { final_status: finalStatus,
                           steps_executed: stepsExecuted,
                           duration_ms: Date.now() - start } })

return { wf_id, final_status, steps_executed, duration_ms: Date.now() - start }
```

---

## 6. 29 step handlers

Source: `packages/workflows/src/step-executor.ts` (511 lines).

`HANDLERS` is a `Record<string, StepHandler>`. `executeStep(ctx)` at
line 486 looks up `HANDLERS[type]` where `type` comes from
`ctx.step.step_type ?? ctx.step.type`, catches thrown errors, and returns
`{status, output|error}`.

### The 29 handlers

| # | Name | Description | Calls |
|---|---|---|---|
| 1 | `create_task` | Create a task in the workflow's project | `createTask({workspace_id, project_id, title, description, priority})` from `@fulcrum/core` |
| 2 | `create_issue` | Create an issue | `planning.createIssue({...})` from `@fulcrum/planning` |
| 3 | `create_epic` | Create an epic | `planning.createEpic({...})` from `@fulcrum/planning` |
| 4 | `write_artifact` | INSERT directly into `artifacts` with `status='draft'` and a computed `display_id` like `ART-0001` | Direct SQL |
| 5 | `read_artifact` | `SELECT * FROM artifacts WHERE artifact_id = ?` | Direct SQL |
| 6 | `review_artifact` | INSERT a row into `reviews` with `status='pending'` | Direct SQL |
| 7 | `write_memory` | Persist a memory with `kind=fact, scope=project` by default | `writeMemory({...})` from `@fulcrum/core` |
| 8 | `read_memory` | Semantic recall of memories for the project | `recallMemory({...})` from `@fulcrum/core` |
| 9 | `invoke_team` | Instantiate a team from a template | `teams.invokeTeam({...})` from `@fulcrum/teams` |
| 10 | `spawn_agent` | Spawn an agent run via the worker lifecycle | `worker.spawnAgent({...})` from `@fulcrum/worker` |
| 11 | `run_script` | Run one of `run_tests|lint|typecheck|build` via `npm run` | `execFile('npm', ['run', script])` |
| 12 | `call_mcp_tool` | Stubbed — records intent, returns `{tool_name, args, note}` | (stub) |
| 13 | `wait_for_task` | Check `tasks.status`; `skipped` if not yet `done` | Direct SQL |
| 14 | `wait_for_review` | Latest review for `target_id` must be `approved` | Direct SQL |
| 15 | `wait_for_artifact` | An artifact of `(owner_id, artifact_type)` must exist | Direct SQL |
| 16 | `branch` | Dotted-path lookup in `ctx.outputs`, compare to `expected` | (pure) |
| 17 | `loop` | Complete once `ctx.attempts+1 >= iterations` | (pure) |
| 18 | `halt` | Returns `{output:{halt:true}}` → runner short-circuits | (pure) |
| 19 | `escalate` | Create a `chief_of_staff` handoff | `createHandoff(getDb(), {...})` from `@fulcrum/core` |
| 20 | `prompt_user` | No-op in runner mode; driven by `stepWorkflow` instead | (stub) |
| 21 | `read_project` | `SELECT * FROM projects WHERE project_id = ?` | Direct SQL |
| 22 | `evaluate_policy` | `checkPolicy({workspace_id, project_id, rule, subject})` | `@fulcrum/core` |
| 23 | `search_web` | Stubbed | (stub) |
| 24 | `search_code` | Stubbed | (stub) |
| 25 | `run_tool` | Stubbed | (stub) |
| 26 | `parallel` | Just marks the fan-out parent complete; the DAG handles children | (pure) |
| 27 | `complete` | Returns `{complete:true}` | (pure) |
| 28 | `validate_schema` | Stubbed | (stub) |
| 29 | `gate` | `skipped` when `config.open === false`, else completed | (pure) |

### Example — `spawn_agent` (line 201)

```ts
HANDLERS['spawn_agent'] = async (ctx) => {
  try {
    const worker = await import('@fulcrum/worker')
    const c = cfg(ctx)
    if (!ctx.project_id) return { status: 'failed', error: 'spawn_agent requires project_id' }
    const result = await worker.spawnAgent({
      workspace_id: ctx.workspace_id,
      project_id: ctx.project_id,
      caller_role: (c['caller_role'] as 'chief_of_staff') ?? 'chief_of_staff',
      target_role: (c['target_role'] as 'software_engineer') ?? 'software_engineer',
      task_id: str(c['task_id']),
      model: c['model'] as string | undefined,
      adapter: c['adapter'] as string | undefined,
    })
    return result.result.status === 'completed'
      ? { status: 'completed', output: { run_id: result.run_id, summary: result.result.summary } }
      : { status: 'failed', error: result.result.error ?? 'spawn_agent blocked' }
  } catch (err) {
    return { status: 'failed', error: `spawn_agent: ${(err as Error).message}` }
  }
}
```

### Example — `run_script` allowlist

```ts
HANDLERS['run_script'] = async (ctx) => {
  const c = cfg(ctx)
  const script = str(c['script'])
  const ALLOWED_SCRIPTS = new Set(['run_tests', 'lint', 'typecheck', 'build'])
  if (!ALLOWED_SCRIPTS.has(script)) {
    return { status: 'failed', error: `run_script: '${script}' not in allowlist` }
  }
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  try {
    const { stdout } = await promisify(execFile)('npm', ['run', script], { cwd: process.cwd() })
    return { status: 'completed', output: { stdout: stdout.slice(0, 4000) } }
  } catch (err) {
    return { status: 'failed', error: (err as Error).message }
  }
}
```

The allowlist is the policy gate — no other scripts may run via workflow.

### Failure mode

Every handler is wrapped in `try/catch` inside `executeStep`:

```ts
try {
  return await handler(ctx)
} catch (err) {
  return { status: 'failed', error: (err as Error).message }
}
```

So no thrown exception ever reaches the runner's main loop; the runner
only sees structured `{status: 'failed', error}` results, which it classifies
into retry / fail-terminal.

---

## 7. Worker spawn pipeline

Source: `packages/worker/src/lifecycle.ts` (145 lines).

At module load time, two adapters are pre-registered:

```ts
registerAgentAdapter(stubAdapter)
registerAgentAdapter(subprocessAdapter)
```

### Flow — `spawnAgent(input)` (line 50)

**Step 1 — policy gate**:

```ts
if (!canInvokeTeams(input.caller_role)) {
  throw new FulcrumError(
    `role '${input.caller_role}' lacks can_invoke_teams`,
    'policy_denied',
  )
}
```

`canInvokeTeams` lives in `@fulcrum/core` `roles.ts` line 46. Only
`chief_of_staff` passes.

**Step 2 — adapter resolution**:

```ts
const adapterName = input.adapter ?? process.env['FULCRUM_AGENT_ADAPTER'] ?? 'stub'
const adapter = getAgentAdapter(adapterName)
if (!adapter) {
  throw new FulcrumError(`unknown agent adapter: ${adapterName}`, 'not_found')
}
```

**Step 3 — create the agent_runs row**:

```ts
const run = await startAgentRun({
  workspace_id: input.workspace_id,
  task_id: input.task_id,
  role: input.target_role,
})
```

`startAgentRun` (in `packages/core/src/runs.ts`) also validates that
`input.workspace_id` matches the task's workspace, eagerly recalls
task-scoped memories into the initial `agent_runs.events` entry, and
captures git context (`git_branch`, `git_commit`).

**Step 4 — open `agent.run` span**:

```ts
const span = await startSpan({
  name: 'agent.run',
  workspace_id: input.workspace_id,
  run_id: run.run_id,
  payload: {
    role: input.target_role,
    adapter: adapterName,
    model: input.model ?? null,
    caller_role: input.caller_role,
  },
})
```

**Step 5 — build SpawnContext + heartbeat closure**:

```ts
const ctx: SpawnContext = {
  run_id: run.run_id,
  workspace_id: input.workspace_id,
  project_id: input.project_id,
  task_id: input.task_id,
  role: input.target_role,
  model: input.model ?? null,
  handoff: input.handoff ?? null,
  worktree_path: input.worktree_path ?? null,
  heartbeat: async (current_step, progress_pct) => {
    await heartbeatAgentRun({
      run_id: run.run_id,
      current_step,
      progress_pct: progress_pct ?? 0,
    })
  },
}
```

The `heartbeat` closure wires adapter heartbeats directly through to
`heartbeatAgentRun`. Missing `progress_pct` defaults to 0 — core API
requires it.

**Step 6 — invoke adapter, catch errors**:

```ts
let result: WorkerResult
try {
  result = await adapter.spawn(ctx)
} catch (err) {
  result = { status: 'blocked', error: (err as Error).message }
}
```

Never lets a run leak in `running` state.

**Step 7 — persist terminal state**:

```ts
if (result.status === 'completed') {
  const artifacts = buildArtifacts(result)
  await completeAgentRun({
    run_id: run.run_id,
    output_summary: result.summary ?? '',
    ...(artifacts ? { artifacts } : {}),
  })
} else {
  await blockAgentRun({
    run_id: run.run_id,
    reason: result.error ?? 'adapter reported blocked status',
  })
}
```

**Step 8 — close span in `finally`**:

```ts
} finally {
  await endSpan({
    span_id: span.span_id,
    status: result.status === 'blocked' ? 'error' : 'ok',
    payload: { status: result.status, summary: result.summary, error: result.error },
  })
}
```

### Memory hooks from `runs.ts`

`packages/core/src/runs.ts` auto-writes memory rows at three lifecycle
transitions. All three go through a `safeWriteMemory` wrapper that
swallows errors so the transition never fails on a memory write:

- **`completeAgentRun`** (line 320) — writes a `task_outcome` memory when
  the summary is longer than 20 characters.
- **`blockAgentRun`** (line 370) — writes a `task_failure` memory when a
  blocker reason is supplied.
- **`escalateAgentRun`** (line 422) — writes a `task_decision` memory
  capturing the escalation.

These write via `safeWriteMemory` (line 58):

```ts
async function safeWriteMemory(input: Parameters<typeof writeMemory>[0]): Promise<void> {
  try {
    await writeMemory(input)
  } catch (err) {
    process.stderr.write(`[runs] auto-write memory failed: ${(err as Error).message}\n`)
  }
}
```

---

## 8. Memory write pipeline

Two implementations share the `writeMemory` name:

- `packages/core/src/memory.ts` — L1-only path, used by CLI and most
  callers.
- `packages/memory/src/write.ts` — full L0→L1→L2 path for vault-enabled
  callers.

### `@fulcrum/core` `writeMemory` (L1-only, line 122)

Validation:

```ts
if (!input.content.trim()) throw new FulcrumError('content must not be empty', 'invalid_input')
if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1))
  throw new FulcrumError('confidence must be between 0 and 1', 'invalid_input')
// ...
if (scope === 'task' && !input.task_id) {
  throw new FulcrumError('scope=task requires task_id', 'invalid_input')
}
```

Dedup path 1 — exact match:

```ts
const existing = db.prepare(
  'SELECT * FROM memories WHERE workspace_id = ? AND project_id = ? AND content = ? AND scope = ? AND kind = ?'
).get(input.workspace_id, input.project_id, input.content, scope, kind) as ...
if (existing) {
  db.prepare('UPDATE memories SET confidence = ?, updated_at = ? WHERE memory_id = ?')
    .run(input.confidence ?? (existing.confidence as number), now, existing.memory_id)
  return rowToMemory(...)
}
```

Dedup path 2 — cosine similarity > 0.9 against any stored embedding in
the same `(workspace_id, project_id)`.

Insert (if neither dedup path matches):

```ts
const memory_id = newId('memory')
db.prepare(`
  INSERT INTO memories
    (memory_id, workspace_id, project_id, scope, kind, title, summary, content,
     canonical_text, tags, entities, confidence, importance, embedding,
     task_id, issue_id, artifact_id, provenance_refs,
     created_at, updated_at, last_accessed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  memory_id, input.workspace_id, input.project_id,
  scope, kind, title, summary, input.content,
  input.canonical_text ?? null,
  JSON.stringify(input.tags ?? []),
  JSON.stringify(input.entities ?? []),
  input.confidence ?? 1.0, input.importance ?? 0.5,
  embeddingBuffer,
  input.task_id ?? null, input.issue_id ?? null, input.artifact_id ?? null,
  JSON.stringify(input.provenance_refs ?? []),
  now, now, now
)
```

ID generation: `memory_id = newId('memory')` — the `@fulcrum/core` ids
helper.

### `@fulcrum/memory` `writeMemory` (full L0+L1+L2, line 16)

Additional validation for `freshness`/`importance` ranges.

**Dedup** — SHA256 content hash via `isDuplicate({db, workspace_id, project_id, hash})`. On match, bump `access_count` and return.

**L0 — vault write** (line 79):

```ts
if (!input.skipVaultWrite) {
  const vaultPath = getVaultPath()
  if (vaultExists(vaultPath)) {
    const filePath = await writeMemoryFile(vaultPath, memoryForVault)
    const relPath = filePath.replace(vaultPath + '/', '')
    const bodyContent = input.canonical_text ?? input.content
    upsertStateEntry(vaultPath, { id: memory_id, path: relPath, mtime: Date.now(), sha256: bodyHash(bodyContent) })
    appendToLog(vaultPath, { ts: now, op: 'WRITE', id: memory_id,
                             meta: `kind=${input.kind} scope=${input.scope} by=agent` })
  }
}
```

L0 is the canonical commit point — it writes a markdown file to
`<vault>/memories/...`, updates `.state.json`, and appends to
`log.ndjson`. L1 is downstream of this.

**L1 — SQLite insert** (line 101):

```sql
INSERT INTO memories (
  memory_id, workspace_id, project_id,
  scope, kind, title, summary, canonical_text,
  content, tags, entities, confidence, freshness, importance,
  file_path, symbol_path, event_time, content_hash,
  task_id, issue_id, artifact_id, provenance_refs,
  embedding, created_at, updated_at, last_accessed_at, access_count
) VALUES (
  ?, ?, ?,
  ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?, ?, 0
)
```

**L2 — async enqueue** (line 132):

```ts
const vaultRoot = getVaultPath()
if (!input.skipVaultWrite) {
  setImmediate(() => {
    runExtractionPipeline(vaultRoot, rowToFullMemory(row!)).catch(() => {})
  })
}
```

`setImmediate` + `.catch(() => {})` — fire-and-forget. The L2 graph/vector
extractors run out-of-band on a KuzuClient.

---

## 9. Memory recall pipeline

Source: `packages/core/src/memory.ts` `recallMemory` at line 211.

### Candidate collection

Two orthogonal sources:

**FTS5 lexical candidates** (line 264):

```ts
ftsRows = db.prepare(`
  SELECT f.rowid, f.rank
  FROM memories_fts f
  JOIN memories m ON m.rowid = f.rowid
  WHERE memories_fts MATCH ?
    AND ${whereSql}
  ORDER BY f.rank
`).all(input.query, ...whereParams) as { rowid: number; rank: number }[]
```

`whereSql` is a dynamic `m.workspace_id = ? [AND m.project_id = ?] [AND m.task_id = ?]`.

If the FTS5 query throws `SQLITE_ERROR` (syntax error, e.g. an unbalanced
quote in the user's query), a `LIKE %query%` fallback kicks in with
neutral rank:

```ts
const likeRows = db.prepare(
  `SELECT m.rowid FROM memories m WHERE ${whereSql} AND m.content LIKE ? LIMIT ?`
).all(...whereParams, `%${input.query}%`, limit) as { rowid: number }[]
ftsRows = likeRows.map(r => ({ rowid: r.rowid, rank: 0 }))
```

**Dense vector candidates** (line 299):

```ts
const embedder = getTextEmbedder()
if (embedder) {
  try {
    const queryVec = await embedder.embed(input.query)
    const vecRows = db.prepare(
      'SELECT rowid, distance FROM vec_memories WHERE embedding MATCH ? ORDER BY distance LIMIT ?'
    ).all(Buffer.from(queryVec.buffer), limit * 3) as { rowid: number; distance: number }[]
    // ...upsert each row with semantic = 1 / (1 + distance)
  } catch {
    // vec_memories table not available — FTS5 results only
  }
}
```

Vector candidates over-fetch at `limit * 3` to leave room for rerank.

### Hybrid scoring

Each candidate tracks the four components from `MEMORY_RANK_WEIGHTS` in
`constants.ts`:

```ts
export const MEMORY_RANK_WEIGHTS = {
  semantic: 0.4,
  lexical:  0.3,
  recency:  0.2,
  confidence: 0.1,
} as const
```

- `semantic` from dense vector similarity `1 / (1 + distance)` (vec0 returns L2 distance).
- `lexical` from FTS5 bm25 rank, normalized `1 / (1 + |rank|)`.
- `recency` exponential decay, ~21-day half-life: `exp(-ageDays/30)`.
- `confidence` clamped to [0, 1], default 0.5 if missing.

```ts
function hybridScore(opts: { semantic, lexical, recency, confidence }): number {
  return opts.semantic * MEMORY_RANK_WEIGHTS.semantic
       + opts.lexical  * MEMORY_RANK_WEIGHTS.lexical
       + opts.recency  * MEMORY_RANK_WEIGHTS.recency
       + opts.confidence * MEMORY_RANK_WEIGHTS.confidence
}
```

Sort by weighted score, take top `limit * 2` for rerank.

### Reranker (optional)

```ts
const reranker = getReranker()
if (reranker && sorted.length > 1) {
  try {
    const passages = sorted.map(c => c.memory.content)
    const scores = await reranker.rerank(input.query, passages)
    sorted = sorted.map((c, i) => {
      const rerankerScore = scores[i]
      if (typeof rerankerScore !== 'number' || !Number.isFinite(rerankerScore)) return c
      const semantic = Math.max(0, Math.min(1, rerankerScore))
      return { ...c, semantic, score: hybridScore({ ...c, semantic }) }
    }).sort((a, b) => b.score - a.score)
  } catch { /* Reranker unavailable — keep the pre-rerank weighted scores */ }
}
```

The reranker score **replaces** the semantic component; the weighted sum
is recomputed. Cross-encoder logits are clamped to [0, 1].

### Access tracking

```ts
if (top.length > 0) {
  const now = new Date().toISOString()
  const ids = top.map(m => m.memory_id)
  const idPlaceholders = ids.map(() => '?').join(',')
  db.prepare(
    `UPDATE memories SET access_count = access_count + 1, last_accessed_at = ?
     WHERE memory_id IN (${idPlaceholders})`
  ).run(now, ...ids)
}
```

Only the rows actually returned get their `access_count` bumped.

### Workspace / project / task filtering

Built from `input` into the dynamic WHERE clause:

```ts
const whereParts: string[] = ['m.workspace_id = ?']
const whereParams: unknown[] = [input.workspace_id]
if (input.project_id) { whereParts.push('m.project_id = ?'); whereParams.push(input.project_id) }
if (input.task_id)    { whereParts.push('m.task_id = ?');    whereParams.push(input.task_id) }
const whereSql = whereParts.join(' AND ')
```

All candidate queries (FTS and vector) bind the same params, so no
cross-workspace leakage is possible.

---

## 10. Merge queue pipeline

Source: `packages/worktrees/src/worktrees.ts` `processMergeQueue`
(line 365).

### Policy gate

```ts
if (!canMerge(input.actor_role as AgentRole)) {
  throw new FulcrumError(
    `POLICY_DENIED: role '${input.actor_role}' not authorized to merge`,
    'policy_denied'
  )
}
```

`canMerge` lives in `@fulcrum/core` `roles.ts` line 50 — currently the
`integration_worker` role is the only one that passes.

### FIFO scan

```ts
const filters: string[] = [`status = 'ready_for_merge'`]
const params: unknown[] = []
if (input.workspace_id) { filters.push('workspace_id = ?'); params.push(input.workspace_id) }
if (input.project_id)   { filters.push('project_id = ?');   params.push(input.project_id) }
const queue = db.prepare(
  `SELECT * FROM worktrees WHERE ${filters.join(' AND ')} ORDER BY updated_at ASC`
).all(...params)
```

FIFO by `updated_at` — the time each worktree transitioned to
`ready_for_merge`.

### Per-worktree loop

**1. Gate check** — `gateArtifactsSatisfied(worktree_id)` (line 315)
requires both a `review_report` and a `test_report` artifact owned by the
worktree with `status='final'`:

```ts
const review = db.prepare(
  `SELECT status FROM artifacts
   WHERE owner_type = 'worktree' AND owner_id = ? AND artifact_type = 'review_report'
   ORDER BY updated_at DESC LIMIT 1`
).get(worktree_id)
const test = db.prepare(
  `SELECT status FROM artifacts
   WHERE owner_type = 'worktree' AND owner_id = ? AND artifact_type = 'test_report'
   ORDER BY updated_at DESC LIMIT 1`
).get(worktree_id)

const missing: string[] = []
if (!review || review.status !== 'final') missing.push('review_report')
if (!test   || test.status !== 'final')   missing.push('test_report')
return { ok: missing.length === 0, missing }
```

Failing the gate pushes the worktree to `skipped[]` and emits
`policy_denied` with `reason: 'missing_merge_gates'`. The loop continues.

**2. Non-git / sequential mode** — if the project has no `git_url`, or
`wtPath === projectRoot`, the worktree is just marked merged:

```ts
db.prepare(
  `UPDATE worktrees SET status = 'merged', merged_at = ?, updated_at = ? WHERE worktree_id = ?`
).run(now, now, worktree_id)
// emit merge_completed, mode: sequential
```

**3. Real git merge** — emits `merge_started`, then runs:

```ts
execFileSync('git', ['merge', '--no-ff', branch_name, '-m', msg], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
})
```

**4. Conflict detection** — on exception, inspect combined stdout+stderr:

```ts
const isConflict =
  combined.includes('CONFLICT') ||
  combined.includes('Automatic merge failed') ||
  combined.toLowerCase().includes('conflict')

if (isConflict) {
  // Abort the pending merge so the repo stays clean.
  try { execFileSync('git', ['merge', '--abort'], { cwd: projectRoot, stdio: 'ignore' }) } catch {}

  // Record a merge_conflict_report artifact. Content goes in a sidecar file
  // under .fulcrum-worktrees/conflicts/<worktree_id>.log; the DB row references it.
  try {
    const conflictDir = join(projectRoot, '.fulcrum-worktrees', 'conflicts')
    mkdirSync(conflictDir, { recursive: true })
    const filePath = join(conflictDir, `${worktree_id}.log`)
    writeFileSync(filePath, combined)
    const artifact_id = newId('artifact')
    db.prepare(
      `INSERT INTO artifacts
         (artifact_id, workspace_id, project_id, display_id, artifact_type,
          title, file_path, owner_type, owner_id, status)
       VALUES (?, ?, ?, ?, 'merge_conflict_report', ?, ?, 'worktree', ?, 'final')`
    ).run(artifact_id, workspace_id, project_id, `ART-MCR-${worktree_id.slice(-8)}`,
          `Merge conflict: ${branch_name}`, filePath, worktree_id)
  } catch (artifactErr) { /* best-effort */ }

  db.prepare(
    `UPDATE worktrees SET status = 'conflict', updated_at = ? WHERE worktree_id = ?`
  ).run(new Date().toISOString(), worktree_id)
  conflicts.push(worktree_id)
  // emit merge_conflicted, severity:'warn'
  continue
}
```

Non-conflict git failures re-throw as a `FulcrumError`.

**5. Success path** — `git worktree remove --force`, set
`status='merged'`, push to `merged[]`, emit `merge_completed`:

```ts
execFileSync('git', ['worktree', 'remove', '--force', wtPath], {
  cwd: projectRoot, stdio: ['ignore', 'ignore', 'pipe'],
})

db.prepare(
  `UPDATE worktrees SET status = 'merged', merged_at = ?, updated_at = ? WHERE worktree_id = ?`
).run(successNow, successNow, worktree_id)
```

### Return shape

```ts
return { merged, skipped, conflicts, results }
```

`results: MergeResult[]` keeps per-row detail for legacy callers.

---

## 11. DB lifecycle + auto-init

Source: `packages/core/src/db/client.ts` (38 lines).

### Singleton

```ts
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'

let _db: Database.Database | null = null

export function getDb(dataDir?: string): Database.Database {
  if (_db) return _db
  const dir = dataDir ?? join(process.cwd(), '.fulcrum')
  mkdirSync(dir, { recursive: true })
  const db = new Database(join(dir, 'fulcrum.db'))
  _configureDb(db)
  _db = db
  return db
}

export function setDb(db: Database.Database): void { _db = db }

export function closeDb(): void { _db?.close(); _db = null }

export function _configureDb(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteVec = require('sqlite-vec') as { load: (db: Database.Database) => void }
    sqliteVec.load(db)
  } catch {
    // sqlite-vec optional — vector search degrades to FTS5-only if unavailable
  }
}
```

**Disk location**: `$CWD/.fulcrum/fulcrum.db`. The `dataDir` parameter
is only used by tests.

**Pragmas**: WAL journaling, foreign keys on, 5s busy timeout.

**sqlite-vec**: loaded opportunistically. If the extension binary is
missing, recall degrades to FTS5-only.

**Test helpers**: `setDb(db)` injects a `:memory:` instance; `closeDb()`
resets the singleton. Both are used by the test suite.

### Migrations

`runMigrations(db)` at `packages/core/src/db/migrations.ts` line 996
iterates 30+ named migrations, each recorded in `schema_migrations`.
Migration 001 runs unconditionally (`INSERT OR IGNORE`); subsequent ones
are guarded by a `SELECT id FROM schema_migrations WHERE name = ?` check.
ALTER TABLE migrations (005, 015, 016 etc.) catch
`duplicate column name` / `already exists` errors to stay idempotent.

The optional `vec_memories`/`vec_chunks` virtual tables are wrapped in
`try {} catch {}` so missing sqlite-vec doesn't break setup.

### Auto-init — `ensureProjectInitialized`

Source: `packages/cli/src/index.ts` line 2037. Called from `main()` on
every command except `--version`.

```ts
async function ensureProjectInitialized(opts: { silent?: boolean } = {}) {
  if (_projectIds) return _projectIds
  const path = await import('path')
  const fs   = await import('fs')
  const crypto = await import('crypto')
  const { getDb, runMigrations, getWorkspace, getProject,
          createWorkspace, createProject } = await import('@fulcrum/core')

  const cwd = process.cwd()
  fs.mkdirSync(path.join(cwd, '.fulcrum'), { recursive: true })
  const db = getDb()
  runMigrations(db)

  // Deterministic IDs: sha256[:12] of the absolute path
  const absPath = path.resolve(cwd)
  const hash = crypto.createHash('sha256').update(absPath).digest('hex').slice(0, 12)
  const sanitizedName = path.basename(absPath).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24) || 'project'
  const workspace_id = `ws_${sanitizedName}_${hash}`
  const project_id   = `proj_${sanitizedName}_${hash}`

  const existingWs   = await getWorkspace(workspace_id)
  const existingProj = await getProject(project_id)
  if (!existingWs)   await createWorkspace({ workspace_id, name: sanitizedName })
  if (!existingProj) await createProject  ({ workspace_id, project_id, name: sanitizedName })

  // Write/update .fulcrum.json so PI cockpit and monitor pick up the same IDs
  const configPath = path.join(cwd, '.fulcrum.json')
  let config: Record<string, unknown> = {}
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown> }
    catch { config = {} }
  }
  const needsWrite =
    config['workspace_id'] !== workspace_id ||
    config['project_id']   !== project_id ||
    typeof config['monitor_port'] !== 'number'
  if (needsWrite) {
    config['workspace_id'] = workspace_id
    config['project_id']   = project_id
    config['monitor_port'] = (typeof config['monitor_port'] === 'number' ? config['monitor_port'] : 4721)
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
  }

  const firstRun = !existingWs || !existingProj || needsWrite
  if (firstRun && !opts.silent && !_projectInitialized) {
    process.stderr.write(`[fulcrum] initialized project "${sanitizedName}" (${workspace_id})\n`)
  }
  _projectInitialized = true
  _projectIds = { workspace_id, project_id }
  return _projectIds
}
```

**Deterministic IDs**: `sha256(absPath).slice(0, 12)` + the sanitized
directory basename. Stable across runs; moving the project to a new
directory starts a fresh slate.

**Idempotency**: `getWorkspace`/`getProject` existence checks plus
`INSERT OR IGNORE` inside the core CRUD calls.

**Silent mode**: `hook` and `serve mcp` pass `{silent: true}` so the
one-line init notice never corrupts the Claude stdio stream.

---

## 12. Configuration resolution

Source: `packages/core/src/config.ts` (82 lines).

### Defaults

```ts
const DEFAULT_TEXT_EMBEDDING: EmbeddingProviderConfig = {
  provider: 'local',
  model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
  dimensions: DEFAULT_EMBED_DIM,   // 1024
}

const DEFAULT_RERANKER: EmbeddingProviderConfig = {
  provider: 'local',
  model: 'onnx-community/bge-reranker-v2-m3-ONNX',
}

const DEFAULT_POLICY: PolicyConfig = {
  wip_limit: 5,
  wip_limit_per_role: {},
  heartbeat_timeout_minutes: DEFAULT_HEARTBEAT_TIMEOUT_SEC / 60,   // 10
  escalation_timeout_minutes: DEFAULT_ESCALATION_TIMEOUT_SEC / 60, // 30
}

export const defaultConfig: FulcrumConfig = {
  workspace_id: '',
  project_id: '',
  port: DEFAULT_MONITOR_PORT,     // 4721
  embedding: { text: DEFAULT_TEXT_EMBEDDING, code: null },
  reranker: DEFAULT_RERANKER,
  policy: DEFAULT_POLICY,
  vault: { path: undefined, l2_enabled: false },
}
```

### Merge order: defaults → `.fulcrum.json` → env overrides

```ts
export function loadConfig(projectRoot?: string): FulcrumConfig {
  const root = projectRoot ?? process.cwd()
  const configPath = join(root, '.fulcrum.json')

  let fileConfig: Partial<FulcrumConfig> = {}
  if (existsSync(configPath)) {
    try {
      const raw: unknown = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
        fileConfig = raw as Partial<FulcrumConfig>
      }
    } catch {
      process.stderr.write(`[fulcrum] Warning: malformed .fulcrum.json at ${configPath}, using defaults\n`)
    }
  }

  const merged: FulcrumConfig = {
    ...defaultConfig,
    ...fileConfig,
    embedding: {
      text: fileConfig.embedding?.text ?? DEFAULT_TEXT_EMBEDDING,
      code: fileConfig.embedding?.code ?? null,
    },
    reranker: fileConfig.reranker ?? DEFAULT_RERANKER,
    policy:   { ...DEFAULT_POLICY, ...(fileConfig.policy ?? {}) },
    vault:    {
      path: fileConfig.vault?.path ?? undefined,
      l2_enabled: fileConfig.vault?.l2_enabled ?? false,
    },
  }

  // Env-var overrides
  if (process.env.FULCRUM_WORKSPACE_ID) merged.workspace_id = process.env.FULCRUM_WORKSPACE_ID
  if (process.env.FULCRUM_PROJECT_ID)   merged.project_id   = process.env.FULCRUM_PROJECT_ID
  if (process.env.FULCRUM_PORT) {
    const n = parseInt(process.env.FULCRUM_PORT, 10)
    if (!Number.isNaN(n)) merged.port = n
  }

  return merged
}
```

### Environment variables (all that are read anywhere in the repo)

Found by grepping the `packages/` tree:

**FULCRUM\_\***
- `FULCRUM_WORKSPACE_ID`, `FULCRUM_PROJECT_ID`, `FULCRUM_PORT` — read by `loadConfig`.
- `FULCRUM_VAULT_PATH` — read by `@fulcrum/memory` vault init and by `fulcrum memory rebuild`.
- `FULCRUM_AGENT_ADAPTER` — selects the worker adapter in `spawnAgent`.
- `FULCRUM_AGENT_STUB_DIR` — stub adapter fixtures directory.
- `FULCRUM_AGENT_SUBPROCESS_CMD` — subprocess adapter command template.
- `FULCRUM_ROLE`, `FULCRUM_MODEL`, `FULCRUM_RUN_ID`, `FULCRUM_TASK_ID`, `FULCRUM_WORKTREE_PATH` — passed as env to subprocess agents by the subprocess adapter.
- `FULCRUM_EMBEDDING_TESTS`, `FULCRUM_SERVER_TESTS` — test gate flags.

**OTEL\_\***
- `OTEL_EXPORTER_OTLP_ENDPOINT` — enables the OTel dual-emitter in `packages/core/src/telemetry/otel.ts`.
- `OTEL_SERVICE_NAME` — service name attribute (default `fulcrum`).

**PLANE\_\*** (used by `@fulcrum/sync` Plane adapter)
- `PLANE_BASE_URL`, `PLANE_API_KEY`, `PLANE_WORKSPACE_SLUG`, `PLANE_PROJECT_ID`.

### `.fulcrum.json` example

```json
{
  "workspace_id": "ws_my_project_3f8a2c1b4e6d",
  "project_id": "proj_my_project_3f8a2c1b4e6d",
  "monitor_port": 4721,
  "port": 4721,
  "embedding": {
    "text": {
      "provider": "local",
      "model": "onnx-community/Qwen3-Embedding-0.6B-ONNX",
      "dimensions": 1024
    },
    "code": null
  },
  "reranker": {
    "provider": "local",
    "model": "onnx-community/bge-reranker-v2-m3-ONNX"
  },
  "policy": {
    "wip_limit": 5,
    "wip_limit_per_role": { "software_engineer": 3 },
    "heartbeat_timeout_minutes": 10,
    "escalation_timeout_minutes": 30
  },
  "vault": {
    "path": "/home/user/.fulcrum/vault",
    "l2_enabled": false
  }
}
```

Note: `monitor_port` is written by `ensureProjectInitialized`,
`port` is read by `loadConfig` — these serve slightly different callers
(cockpit discovery vs monitor startup).

---

## 13. Telemetry pipeline

Source: `packages/core/src/telemetry/spans.ts` (123 lines) +
`packages/core/src/telemetry/otel.ts` (97 lines).

### `startSpan` (spans.ts line 41)

```ts
export async function startSpan(input: StartSpanInput): Promise<TelemetrySpan> {
  const db = getDb()
  const span_id = newId('span')
  let trace_id = span_id
  if (input.parent_span_id) {
    const parent = db.prepare(
      `SELECT trace_id FROM trace_events WHERE span_id = ?`
    ).get(input.parent_span_id) as { trace_id: string } | undefined
    if (parent) trace_id = parent.trace_id
  }
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO trace_events (span_id, trace_id, parent_span_id, name, workspace_id, run_id, status, started_at, ended_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, 'started', ?, NULL, ?)`
  ).run(
    span_id, trace_id, input.parent_span_id ?? null,
    input.name, input.workspace_id, input.run_id ?? null,
    now, input.payload ? JSON.stringify(input.payload) : null,
  )
  // ... fetch the row, dual-emit to OTel if tracer present ...
  return rowToSpan(row)
}
```

**trace_id propagation**: a root span has `trace_id === span_id`. A child
span inherits the `trace_id` of its `parent_span_id`. This gives a clean
tree where you can query `WHERE trace_id = ?` to get every span in the
run.

### `endSpan` (spans.ts line 83)

Updates `trace_events SET status, ended_at, payload = ?` where the new
payload is a **shallow merge** of the existing payload with the one
passed to `endSpan`:

```ts
if (input.payload) {
  const existing = db.prepare(
    `SELECT payload FROM trace_events WHERE span_id = ?`
  ).get(input.span_id) as { payload: string | null } | undefined
  const current = existing?.payload ? JSON.parse(existing.payload) : {}
  const merged = { ...current, ...input.payload }
  db.prepare(
    `UPDATE trace_events SET status = ?, ended_at = ?, payload = ? WHERE span_id = ?`
  ).run(input.status, now, JSON.stringify(merged), input.span_id)
} else {
  db.prepare(
    `UPDATE trace_events SET status = ?, ended_at = ? WHERE span_id = ?`
  ).run(input.status, now, input.span_id)
}
```

Lets callers attach start-time metadata in `startSpan` (role, adapter, …)
and end-time metrics in `endSpan` (duration, final_status, error) without
clobbering.

### OTel dual-emit (otel.ts)

Active only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set:

```ts
export async function initOtel(): Promise<void> {
  if (_tracer) return
  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
  if (!endpoint) return

  const serviceName = process.env['OTEL_SERVICE_NAME'] ?? 'fulcrum'

  try {
    const { NodeTracerProvider, BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-node')
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
    const { Resource } = await import('@opentelemetry/resources')
    const { ATTR_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions')
    const { trace } = await import('@opentelemetry/api')

    const resource = new Resource({ [ATTR_SERVICE_NAME]: serviceName })
    const exporter = new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` })
    const provider = new NodeTracerProvider({ resource })
    provider.addSpanProcessor(new BatchSpanProcessor(exporter))
    provider.register()

    _sdk = provider
    _tracer = trace.getTracer('fulcrum', '0.0.1')
    process.stderr.write(`[fulcrum/otel] initialized, exporting to ${endpoint}\n`)
  } catch (err) { ... }
}
```

In `startSpan`, if a tracer is installed:

```ts
const tracer = getOtelTracer()
if (tracer) {
  try {
    const otelSpan = tracer.startSpan(input.name, {
      attributes: payloadToAttributes(input.name, input.payload ?? {}),
    })
    registerOtelSpan(span_id, otelSpan)
  } catch { /* best-effort, never fail the DB path */ }
}
```

`payloadToAttributes` maps agent-related fields to OTel
`gen_ai.*` semantic conventions:

```ts
if (name.startsWith('agent.') || name.startsWith('workflow.step')) {
  if (k === 'role' || k === 'target_role') attrs['gen_ai.agent.name'] = String(v)
  else if (k === 'model') attrs['gen_ai.request.model'] = String(v)
  else if (k === 'adapter') attrs['gen_ai.system'] = `fulcrum.${String(v)}`
  else attrs[`fulcrum.${k}`] = v
}
```

In `endSpan`, the matching OTel span is finalized via `popOtelSpan`:

```ts
const otelSpan = popOtelSpan(input.span_id)
if (otelSpan) {
  try {
    if (input.payload) {
      const attrs = payloadToAttributes('', input.payload)
      for (const [k, v] of Object.entries(attrs)) otelSpan.setAttribute(k, v)
    }
    if (input.status === 'error') {
      const { SpanStatusCode } = await import('@opentelemetry/api')
      otelSpan.setStatus({ code: SpanStatusCode.ERROR })
    }
    otelSpan.end()
  } catch { /* best-effort */ }
}
```

### Auto-instrumented call sites (one quote each)

**`workflow.run`** — `packages/workflows/src/runner.ts` line 194:

```ts
const runSpan = await startSpan({
  name: 'workflow.run',
  workspace_id,
  payload: { wf_id: input.wf_id },
})
```

**`workflow.step`** — `packages/workflows/src/runner.ts` line 244:

```ts
const stepSpan = await startSpan({
  name: 'workflow.step',
  workspace_id,
  parent_span_id: runSpan.span_id,
  payload: {
    step_id,
    step_type: (def as unknown as { step_type?: string; type?: string }).step_type
      ?? (def as unknown as { type?: string }).type
      ?? 'unknown',
    attempts: state.attempts,
  },
})
```

**`agent.run`** — `packages/worker/src/lifecycle.ts` line 77:

```ts
const span = await startSpan({
  name: 'agent.run',
  workspace_id: input.workspace_id,
  run_id: run.run_id,
  payload: {
    role: input.target_role,
    adapter: adapterName,
    model: input.model ?? null,
    caller_role: input.caller_role,
  },
})
```

**`janitor.cycle`** — `packages/core/src/janitor.ts` opens one span per
tick and closes it with the count of reaped rows (heartbeat stale
detection, abandoned worktrees cleanup, etc.).

**`mcp.tool`** — `packages/cli/src/index.ts` line 1191:

```ts
const mcpSpan = await startSpan({
  name: 'mcp.tool',
  workspace_id: spanWorkspaceId,
  payload: { tool_name: toolName, request_id: String(id ?? '') },
})
```

---

## 14. End-to-end user stories

### 14.1 Fresh machine: `pnpm install && pnpm run setup`

1. `pnpm install` hydrates `node_modules/` for the monorepo — TypeScript,
   better-sqlite3, sqlite-vec (may fail silently; recall degrades), the
   transformers.js toolchain for local embeddings, ONNX runtimes for the
   Qwen3 + bge-reranker models, OTel SDK packages (optional path).
2. `pnpm run setup` invokes `node --import tsx/esm agent-integration/install.ts all`:
   - Prints the header `Fulcrum global installer — target: all`.
   - **Step 1** creates `~/.local/bin/fulcrum` → `<repo>/fulcrum` symlink, warns if PATH misses that directory.
   - **Step 2** runs `fulcrum --version` to verify PATH resolution. On first install this often warns — "reopen your shell".
   - **Step 3** runs `claude mcp add --scope user fulcrum -- fulcrum serve mcp` (falls back to editing `~/.claude.json`).
   - **Step 4** merges `PreToolUse` + `PostToolUse` entries into `~/.claude/settings.json`, both with `matcher="*"`, commands `fulcrum hook claude pre` and `fulcrum hook claude post`.
   - **Step 5** appends the fulcrum section (wrapped in `<!-- fulcrum:begin/end -->`) to `~/.claude/CLAUDE.md`.
   - **Step 6** copies each `*.md` under `agent-integration/skills/` into `~/.claude/skills/fulcrum/`.
   - **Step 7** copies `gemini-extension.json` + `GEMINI.md` into `~/.gemini/extensions/fulcrum/`.
   - **Step 8** runs `pi install <repo>/agent-integration/pi/cockpit` (skips with a warning if `pi` is missing).
3. After the plan, `printSummary(target)` prints the installed rows and
   the list of warnings/failures, followed by the "Next steps" block.
4. `fulcrum --version` (from `main()` line 2104) reads `packages/cli/package.json`
   and prints its `version` field (currently `0.0.1`).

**On disk after setup:**
- `~/.local/bin/fulcrum` (symlink)
- `~/.claude/settings.json` (merged hooks)
- `~/.claude/CLAUDE.md` (fulcrum section)
- `~/.claude/skills/fulcrum/*.md`
- `~/.claude.json` (MCP entry, if `claude` CLI wasn't available for `mcp add`)
- `~/.gemini/extensions/fulcrum/gemini-extension.json` + `GEMINI.md`
- PI cockpit files under its own namespace (if `pi` was installed)

### 14.2 `fulcrum task list` in a fresh project

1. Shell dispatch → `/home/mkh/.local/bin/fulcrum` → repo wrapper → `node --import tsx/esm packages/cli/src/index.ts task list`.
2. `main()` sees `group='task'`, `command='list'`. Since `task` is neither `hook` nor `serve mcp`, `silentInit=false`.
3. `ensureProjectInitialized()` runs:
   - `mkdir -p ./.fulcrum`
   - `getDb()` creates/opens `./.fulcrum/fulcrum.db`, enables WAL, FKs, attempts `sqlite-vec` load.
   - `runMigrations(db)` iterates the 30+ migrations. On a fresh DB they all apply; on a subsequent run they're no-ops.
   - Compute `workspace_id = ws_${basename}_${sha256(absPath)[:12]}`, same for `project_id`.
   - `getWorkspace/getProject` return undefined → `createWorkspace` + `createProject`.
   - Writes `./.fulcrum.json` with `{workspace_id, project_id, monitor_port: 4721}`.
   - Prints `[fulcrum] initialized project "${name}" (${workspace_id})` to stderr.
4. Dispatch to `runTasks()` → lazy-imports `listTasks, createTask, updateTask` from `@fulcrum/core`.
5. `sub='list'` branch → `currentProjectIds()` returns the deterministic IDs.
6. `listTasks({workspace_id, project_id, status})` SELECTs from `tasks` ordered by created_at.
7. `outputRows(rows.map(t => ({...})))` prints a TSV table, or JSON if `--json` is in `args`.

First run: single-line init notice on stderr, then `(no rows)` on stdout
(assuming no tasks exist yet).

### 14.3 Claude Code hook fires because the user typed Write

1. Claude Code decides to call the `Write` tool. Before doing so, it consults `~/.claude/settings.json`, finds the `PreToolUse` entry with `matcher: "*"` and `command: "fulcrum hook claude pre"`, and spawns that command.
2. Claude Code writes the JSON event to the child's stdin:
   ```json
   {"tool_name": "Write", "tool_input": {"file_path":"/tmp/x", "content":"..."}, "session_id": "abc..."}
   ```
3. `main()` sees `group='hook', command='claude'`. `silentInit=true`, so `ensureProjectInitialized` still runs but suppresses the "initialized project" notice.
4. `runHook('claude', 'pre')` reads stdin, `JSON.parse`, `normalizeHookEvent('claude', event)` → `{toolName:'Write', toolInput:{file_path, content}, sessionId, agentRole:'', runId:''}`.
5. Emits a `hook_executed` event (`phase: 'pre'`) into the `events` table (best-effort — swallowed on failure).
6. `runPreHook(ctx, io)`:
   - **Phase 1 — secret scan**: `checkSecrets(JSON.stringify(toolInput))`. If a pattern matches (API key, AWS credential, private key, …), emit `policy_denied` with `reason: 'secret_scan_denied'`, print two stderr lines, `exit(2)`. Claude Code denies the tool call.
   - **Phase 2 — team-invoke policy**: skipped — `toolName` is `Write`, not `invoke_team`.
   - **Phase 3 — memory recall**: `HOOK_WRITE_TOOLS.has('Write')` is true, but `ctx.runId === ''`, so the whole recall block is skipped. (The runId path fires only when PI's hook provides it.)
   - `io.exit(0)` → Claude Code proceeds with the write.
7. After the write completes, Claude Code spawns `fulcrum hook claude post` with a similar event. `runPostHook(ctx, io)` with no `runId` exits immediately (nothing to scope the trace to). If a runId is present, it writes a `tool_trace` memory with `Tool`, `Keys` (keys only), `Session`, `Run` — **never** the values.

### 14.4 Workflow with 3 steps (create_task → spawn_agent → halt)

1. User runs `fulcrum workflow start --workflow-name implement_feature`.
   `startWorkflow` INSERTs a row into `workflow_runs` with `status='running'`, `version=0`, and a `steps` JSON blob of the form `{states: [{step_id, status:'pending', attempts:0}, ...], defs: [...]}`.
2. User then runs `fulcrum workflow run --wf-id <id>`.
3. `runWorkflow(input)`:
   - `loadRun` SELECTs the row and parses the steps blob.
   - Opens the `workflow.run` root span, `trace_id = span_id`. A `trace_events` row goes in with `status='started'`.
   - **Iteration 1**: `nextReadySteps` returns `['s1']` (create_task has no deps). Opens `workflow.step` span with `parent_span_id = runSpan.span_id` (so it inherits `trace_id`). A second `trace_events` row is inserted.
     - `executeStep(ctx)` dispatches to `HANDLERS['create_task']`. `createTask` INSERTs a row into `tasks`, returns `{task_id, display_id}`.
     - Runner marks `s1.status='completed'`, `s1.result={task_id, display_id}`, persists via `persistStates` → `UPDATE workflow_runs SET steps=..., version=version+1, updated_at=?`. Two DB writes have now happened: the task insert and the workflow UPDATE.
     - Closes the `workflow.step` span (`status='ok'`).
   - **Iteration 2**: `nextReadySteps` returns `['s2']` (spawn_agent, now unblocked by s1 completing). Opens another `workflow.step` span.
     - `HANDLERS['spawn_agent']` → `worker.spawnAgent({caller_role:'chief_of_staff', target_role:'software_engineer', task_id, ...})`.
       1. `canInvokeTeams('chief_of_staff')` passes.
       2. Adapter resolved to `stub` (the default). The stub's `spawn(ctx)` returns a synthetic `{status:'completed', summary}` immediately.
       3. `startAgentRun` INSERTs a row into `agent_runs`, writes an initial event, runs `recallTaskContext` for task memories.
       4. `agent.run` span opens with `run_id` attribute.
       5. Stub adapter runs; no heartbeats because completion is instant.
       6. `completeAgentRun` writes the terminal row, `status='completed'`. If the summary > 20 chars, a `task_outcome` memory is written via `safeWriteMemory`.
       7. `endSpan` closes the `agent.run` span.
     - Runner marks `s2.status='completed'`, `s2.result={run_id, summary}`, persists.
     - Closes the `workflow.step` span.
   - **Iteration 3**: `nextReadySteps` returns `['s3']` (halt). Opens another `workflow.step` span.
     - `HANDLERS['halt']` returns `{status:'completed', output:{halt:true}}`.
     - Runner sets `s3.status='completed'`, sees `output.halt === true`, sets `haltRequested = true`, breaks out of the inner loop.
     - Closes the `workflow.step` span.
   - Outer loop exits (`haltRequested`). Terminal computation: `allTerminal && !anyFailed` → `finalStatus='completed'`, `dbStatus='completed'`.
   - `persistStates(input.wf_id, states, step_defs, 'completed', lastCurrentStep)` — UPDATE `workflow_runs SET status='completed', status_category='done', completed_at=?, version=version+1, updated_at=?`.
   - `endSpan(runSpan, 'ok', {final_status:'completed', steps_executed:3, duration_ms})`.
4. User-visible result is the record `{wf_id, final_status:'completed', steps_executed:3, duration_ms}`.

**Rows written, in order:**

| # | Table | Operation | Notes |
|---|---|---|---|
| 1 | `trace_events` | INSERT | workflow.run span, status='started' |
| 2 | `trace_events` | INSERT | workflow.step span (s1) |
| 3 | `tasks` | INSERT | create_task result |
| 4 | `trace_events` | UPDATE | workflow.step span (s1) ended ok |
| 5 | `workflow_runs` | UPDATE | states persisted after s1 |
| 6 | `trace_events` | INSERT | workflow.step span (s2) |
| 7 | `agent_runs` | INSERT | startAgentRun for s2 |
| 8 | `trace_events` | INSERT | agent.run span |
| 9 | `agent_runs` | UPDATE | heartbeats (if any) |
| 10 | `agent_runs` | UPDATE | completeAgentRun terminal |
| 11 | `memories` | INSERT | task_outcome (conditional) |
| 12 | `trace_events` | UPDATE | agent.run span ended ok |
| 13 | `trace_events` | UPDATE | workflow.step span (s2) ended ok |
| 14 | `workflow_runs` | UPDATE | states persisted after s2 |
| 15 | `trace_events` | INSERT | workflow.step span (s3) |
| 16 | `trace_events` | UPDATE | workflow.step span (s3) ended ok |
| 17 | `workflow_runs` | UPDATE | states + status='completed', version bump |
| 18 | `trace_events` | UPDATE | workflow.run span ended ok |

All 18 writes share the same `trace_id`, so the full run is queryable
via a single `SELECT * FROM trace_events WHERE trace_id = ? ORDER BY started_at ASC`.
