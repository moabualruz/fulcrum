# PI Runtime Integration Guide

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
