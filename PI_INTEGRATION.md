# PI Runtime Integration Guide

## Multi-runtime support

This system supports three agent execution backends, selectable per agent role:

| Backend | Model prefix | Auth | Notes |
|---|---|---|---|
| PI native | (none / any) | API key or PI config | Full PI features, team support |
| Claude CLI | `claude-cli/` | Claude Code OAuth | No API billing, stateless |
| Gemini CLI | `gemini-cli/` | Gemini CLI OAuth | No API billing, stateless |

`auto_configure_pi_runtime()` wires a `RoutingAdapter` that dispatches based on the first
`models:` entry in each agent's `.md` frontmatter. Set the prefix in the agent definition file.

For MCP tool access, run `pi serve mcp` and install the integration package:
```bash
bash agent-integration/claude/install.sh   # Claude Code
bash agent-integration/gemini/install.sh   # Gemini CLI
bash agent-integration/pi/install.sh       # PI native extension
```

---

## What is PI?

PI (`@mariozechner/pi-coding-agent`) is a TypeScript/Node.js terminal coding agent developed
by Mario Zechner ([@badlogic](https://github.com/badlogic/pi-mono)). It is a standalone CLI
tool — not a Python package. PI owns the agent execution layer: it manages native agent
definitions, model and provider assignment, extension registration, skill loading, and
subagent/team orchestration via the `@tintinweb/pi-subagents` extension.

PI is the authoritative execution host as defined in spec §3.1. This Python codebase is the
control plane — it issues task packets, tracks run status, and routes results into the
workflow engine. All LLM calls and tool invocations are delegated to PI.

## Current state

| Layer | Status |
|---|---|
| Control plane (tasks, memory, policy, monitor) | Works without PI — stub active |
| `PIRPCBridge` | Implemented and tested — activates when `pi` is in PATH |
| Real LLM agent execution | Requires PI + Anthropic API key |

## Prerequisites

```bash
# Node.js 20+ required
node --version

# Install PI
npm install -g @mariozechner/pi-coding-agent

# Install subagent extension (enables Agent tool for team/parallel execution)
npm install -g @tintinweb/pi-subagents

# Verify
pi --version
which pi
```

## Activating the real PI runtime

```python
from pi_agent_os.worker.pi_adapter import auto_configure_pi_runtime

# Auto-detects pi in PATH. Returns True if real bridge activated, False = stub.
real = auto_configure_pi_runtime()
print("PI bridge:", real)
```

Or explicitly:

```python
from pi_agent_os.worker.pi_rpc_bridge import PIRPCBridge
from pi_agent_os.worker.pi_adapter import configure_pi_runtime

configure_pi_runtime(PIRPCBridge(
    provider="anthropic",          # or "google", "openai"
    default_model="claude-sonnet-4-6",
    timeout=300.0,
))
```

Set your API key before spawning agents:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## PI RPC protocol

PI is started in RPC mode: `pi --mode rpc --provider anthropic --no-session`

Communication is **event-streaming JSONL** over stdio — not method-based JSON-RPC.

### Commands (Python → PI stdin, one JSON line each)

| Command | JSON | Notes |
|---|---|---|
| Send prompt | `{"id": "r1", "type": "prompt", "message": "..."}` | Starts agent; returns immediately |
| Abort run | `{"type": "abort"}` | Stops current agent turn |
| Set model | `{"type": "set_model", "provider": "anthropic", "modelId": "..."}` | Switch model mid-session |
| New session | `{"type": "new_session"}` | Reset conversation |

### Events (PI stdout → Python)

| Event type | Meaning |
|---|---|
| `agent_start` | Agent begins processing |
| `message_update` | Streaming text/tool delta (`assistantMessageEvent.type = "text_delta"`) |
| `tool_execution_start` | Tool call begins |
| `tool_execution_end` | Tool call completes |
| `agent_end` | Agent finished — includes all `messages` in the payload |
| `error` | Error (`reason`: `"aborted"` or `"error"`) |
| `response` | Acknowledgement of a command (`{"type": "response", "command": "prompt", "success": true}`) |

### How `PIRPCBridge.spawn_agent()` works

1. Starts `pi --mode rpc --provider anthropic --model <model> --no-session` subprocess
2. Reads agent definition from `.pi/agents/<profile_id>.md` for model + system prompt
3. Sends task as `{"type": "prompt", "message": "<task markdown>"}`
4. Background reader thread collects events until `agent_end` or `error`
5. Returns `run_id` immediately — use `wait_for_run(run_id)` to block for result

## Agent definition files

PI agent types are defined in `.pi/agents/<name>.md` with YAML frontmatter.
Bundled stubs live in `src/pi_agent_os/pi_agents/`. Copy them to `.pi/agents/`
to use project-local definitions (takes precedence over bundled stubs).

```bash
mkdir -p .pi/agents
cp src/pi_agent_os/pi_agents/*.md .pi/agents/
```

Example — `chief_of_staff.md`:

```markdown
---
model: claude-opus-4-6
system: |
  You are the Chief of Staff agent for this project.
  Your role is to understand user requests, plan execution, and orchestrate
  specialized agents via the Agent tool. You never write code directly.
tools:
  - read_file
  - bash
  - Agent
memory_scope: project
---
```

### Role → Profile mapping

```
chief_of_staff      → claude-opus-4-6   (.pi/agents/chief_of_staff.md)
implementer_backend → claude-sonnet-4-6 (.pi/agents/implementer_backend.md)
implementer_frontend→ claude-sonnet-4-6 (.pi/agents/implementer_frontend.md)
tester              → claude-sonnet-4-6 (.pi/agents/tester.md)
reviewer            → claude-sonnet-4-6 (.pi/agents/reviewer.md)
research_worker     → claude-sonnet-4-6 (.pi/agents/research_worker.md)
integration_worker  → claude-sonnet-4-6 (.pi/agents/integration_worker.md)
```

To list available profiles at runtime:

```python
from pi_agent_os.worker.pi_adapter import get_pi_runtime
profiles = get_pi_runtime().list_profiles()
```

## Team support via pi-subagents

The `@tintinweb/pi-subagents` extension adds an `Agent` tool to PI that the LLM
can call to spawn parallel sub-agents. When `invoke_team()` is called:

1. A Chief of Staff agent is spawned
2. Its system prompt instructs it to use the `Agent` tool to spawn specialists
3. The `Agent` tool runs sub-agents in isolated sessions

```python
rt = get_pi_runtime()
instance_id = rt.invoke_team("feature-build-team", {
    "title": "Add OAuth login",
    "description": "Implement GitHub OAuth...",
})
result = rt.wait_for_run(instance_id, timeout=600)
```

**Note:** Subagents run as child `pi` processes. Concurrency is controlled by the
pi-subagents extension (default limit: 4 parallel agents).

## Using worktrees with agents

Pass `worktree_path` in `PIAgentConfig` to run an agent in an isolated git worktree
(see `WorktreeAllocator`):

```python
from pi_agent_os.worker.pi_adapter import get_pi_runtime, PIAgentConfig

run_id = get_pi_runtime().spawn_agent(PIAgentConfig(
    profile_id="implementer_backend",
    task_packet={"title": "Fix auth bug", "description": "..."},
    worktree_path="/path/to/worktree",
))
```

## Using Claude CLI or Gemini CLI as providers

Set the `models:` frontmatter in any agent `.md` file:

```markdown
---
models: claude-cli/claude-sonnet-4-6
system: |
  You are the Chief of Staff for this project.
  ...
---
```

The `RoutingAdapter` (wired by `auto_configure_pi_runtime()`) routes `claude-cli/*` to
`ClaudeCLIAdapter` and `gemini-cli/*` to `GeminiCLIAdapter`. No PI required for these agents.

### Pre-requisites for Claude CLI
```bash
# Claude Code CLI must be installed and authenticated
claude --version
# Logged in? (uses existing Claude Code OAuth session)
```

### Pre-requisites for Gemini CLI
```bash
npm install -g @google/gemini-cli
gemini   # run once interactively to complete OAuth
```

### Installing the MCP integration

The MCP server exposes control plane tools (`create_task`, `update_task`, etc.) to Claude and
Gemini under a namespaced prefix, avoiding conflicts with built-in tools.

```bash
# Install Claude integration (CLAUDE.md, .mcp.json, PreToolUse hooks)
bash agent-integration/claude/install.sh

# Install Gemini integration (GEMINI.md, gemini-extension.json, BeforeTool hooks)
bash agent-integration/gemini/install.sh

# Start MCP server for Claude (stdio transport, used by .mcp.json automatically)
pi serve mcp

# Or start as HTTP SSE server
pi serve mcp --transport sse --port 7200

# Start HTTP hook server (for Claude http-type hooks)
pi serve hooks --port 7100

# Start both
pi serve all
```

### OTel observability

All three adapters emit OTel spans. To export to a collector:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_SERVICE_NAME=pi-agent-os
```

Configure the SDK in your entrypoint before calling `auto_configure_pi_runtime()`.

---

---

## PI Native Extension (when you are building PI)

If you are writing PI itself, use the native extension instead of the external CLI adapters.
The extension connects PI to pi-agent-os via MCP stdio and gives PI's runtime code direct
access to all 13 control plane tools without any subprocess bridging overhead.

### Install

```bash
bash agent-integration/pi/install.sh
# Copies pi-os.extension.json to ~/.pi/extensions/ (or $PI_EXTENSIONS_DIR)
# Copies PI.md to the project root for context injection
```

### How it works

PI starts `python -m pi_agent_os.mcp.server` as a subprocess and communicates over MCP
stdio. The extension manifest (`pi-os.extension.json`) declares:
- The MCP server subprocess
- The BeforeTool hook (`python -m pi_agent_os.hooks.pi_hook`)
- A `lifecycleTools` map for PI's runtime code

### Lifecycle integration

PI's runtime code (not the LLM) should call these MCP tools:

```typescript
// On task start:
const { run_id } = await mcp.call("mcp__pi-os__start_agent_run", {
  task_id: "tsk-...",
  agent_role: "implementer",
  workspace_id: "ws-...",
  project_id: "proj-...",   // optional
  worktree_path: "/path",   // optional
  pi_run_id: "my-id",       // optional, PI can supply its own run ID
});

// Every ~30s while running:
await mcp.call("mcp__pi-os__heartbeat_agent_run", {
  run_id, workspace_id: "ws-...",
  current_step: "running tests",
  progress_pct: 60.0,
});

// On success:
await mcp.call("mcp__pi-os__complete_agent_run", {
  run_id, workspace_id: "ws-...",
  output_summary: "Implemented login page, all tests pass",
  artifact_paths: "src/auth.py,tests/test_auth.py",
});

// On blocker:
await mcp.call("mcp__pi-os__block_agent_run", {
  run_id, workspace_id: "ws-...",
  reason: "Cannot proceed: missing database credentials",
});
```

### Chief of Staff dispatch

Before spawning a `chief_of_staff` agent, inject world-state context:

```typescript
const { context_markdown } = await mcp.call("mcp__pi-os__build_cos_context", {
  goal: "implement user authentication",
  project_id: "proj-...",
  workspace_id: "ws-...",
});
// Prepend context_markdown to the CoS agent's system prompt
```

### Workspace status

Single-call snapshot for dashboards or routing decisions:

```typescript
const status = await mcp.call("mcp__pi-os__get_workspace_status", {
  workspace_id: "ws-...",
});
// Returns: active_runs, blocked_runs, merge_queue_depth, wip_count, runs[], blockers[]
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `PI CLI not found` | `npm install -g @mariozechner/pi-coding-agent` + check PATH |
| `Bridge activated: False` | `which pi` — ensure npm global bin is in shell PATH |
| Agent times out | Increase `timeout` in `PIRPCBridge(timeout=600)` |
| No `Agent` tool in pi | `npm install -g @tintinweb/pi-subagents` |
| Auth error | Set `ANTHROPIC_API_KEY` or use `pi --api-key <key>` |
| Wrong model | Check `.pi/agents/<profile>.md` frontmatter `model:` field |
| `pi --mode rpc` hangs | PI waits for stdin — the bridge sends the prompt after startup |
