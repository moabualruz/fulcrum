# PI Runtime Integration Guide

## What is PI?

PI (`@mariozechner/pi-coding-agent`) is a TypeScript/Node.js terminal coding agent developed by Mario Zechner ([@badlogic](https://github.com/badlogic), github.com/badlogic/pi-mono). It is a standalone CLI tool, not a Python package. PI owns the agent execution layer: it manages native agent definitions (Markdown files with YAML frontmatter), model and provider assignment, extension registration, skill loading, and subagent/team orchestration. PI is the authoritative execution host as defined in spec §3.1.

PI communicates with external systems through an RPC mode (`pi --rpc`) that exposes a JSON-RPC 2.0 interface over stdio. This Python codebase acts as a control plane that talks to PI through that interface — it issues task packets, polls run status, and routes results back into the agent OS workflow engine. All LLM calls, tool invocations, and model-level decisions are delegated entirely to PI.

## Current state

The Python codebase uses `StubPIRuntimeAdapter` by default (blocker B-001 in BLOCKERS.md).
All control-plane features (tasks, memory, monitoring, policy, workflows) work without PI.

What requires PI:
- Actual LLM agent execution (spawning real agents)
- Model and provider assignment
- Team orchestration (parallel agent invocation)
- PI-native skill and extension loading

What works without PI (stub mode):
- Task management, issue decomposition, workflow definitions
- Memory indexing and retrieval
- Policy enforcement
- Worktree allocation and merge queue
- Analytics and monitoring infrastructure

## Prerequisites

```bash
# Node.js 20+ required
node --version

# Install PI
npm install -g @mariozechner/pi-coding-agent

# Verify
pi --version

# Install subagent extension (for team/subagent support)
npm install -g @tintinweb/pi-subagents
```

## Enabling the real PI runtime

```python
from pi_agent_os.worker.pi_adapter import auto_configure_pi_runtime

# Auto-detects PI CLI on PATH or falls back to stub
configured = auto_configure_pi_runtime()
if configured:
    print("Using real PI runtime")
else:
    print("PI not found — using stub (development mode)")
```

Or configure explicitly:

```python
from pi_agent_os.worker.pi_rpc_bridge import PIRPCBridge
from pi_agent_os.worker.pi_adapter import configure_pi_runtime

bridge = PIRPCBridge(pi_command="pi", timeout=60.0)
configure_pi_runtime(bridge)

# Use as context manager for clean shutdown:
with PIRPCBridge() as bridge:
    configure_pi_runtime(bridge)
    # ... run your workload ...
```

## PI RPC protocol

PI in `--rpc` mode reads JSON-RPC 2.0 request objects from stdin (one per line) and writes JSON-RPC 2.0 response objects to stdout (one per line).

### Request format

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "method": "agent.spawn",
  "params": { ... }
}
```

### Response format (success)

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "result": { ... }
}
```

### Response format (error)

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "error": { "code": -32000, "message": "description" }
}
```

### Methods used by this codebase

| Method | Params | Result |
|---|---|---|
| `agent.spawn` | `profile_id`, `task`, `worktree`, `timeout` | `{ "run_id": "..." }` |
| `agent.status` | `run_id` | `{ "run_id", "status", "output", "artifacts", "error" }` |
| `team.invoke` | `template_id`, `task` | `{ "instance_id": "..." }` |
| `profiles.list` | _(none)_ | array of profile objects |
| `profiles.get` | `profile_id` | profile object or null |

`agent.status` returns `status` values: `"running"`, `"completed"`, `"failed"`, `"blocked"`.

## Agent definition files

PI agent definitions live in `.pi/agents/<name>.md` in your project root, using YAML frontmatter:

```yaml
---
model: claude-opus-4-5
system: |
  You are a backend implementer responsible for writing clean,
  tested, well-documented Python code.
tools:
  - read_file
  - write_file
  - run_tests
memory_scope: project
handoff_mode: artifact_first_brief
---
```

The body of the Markdown file can contain additional instructions, examples, or context for the agent.

### Role → PI profile mapping

`routing/roles.py` defines the canonical role vocabulary and `DEFAULT_ROLE_MAPPINGS`. Each `RoleMapping` has a `primary_profile` field that holds the PI profile ID. At runtime, the router resolves a role to a profile ID and passes it to `PIRuntimeAdapter.spawn_agent()` via `PIAgentConfig.profile_id`.

The profile ID corresponds to the filename of the agent definition file (without `.md`), e.g. role `implementer_backend` → profile `pi_profile_implementer_backend` → `.pi/agents/pi_profile_implementer_backend.md`.

In production, the mapping table is loaded from `agent-home/config/role_mappings.yaml`.

## Creating PI agent definitions for each role

Templates are provided in `src/pi_agent_os/pi_agents/`. Copy them to `.pi/agents/` in your project and customise the system prompt and tool list for your codebase.

### chief_of_staff

```yaml
---
model: claude-opus-4-6
system: |
  You are the Chief of Staff AI agent. You orchestrate teams of specialist
  agents to accomplish complex engineering tasks. You plan, delegate, and
  coordinate — you never write code directly.
tools:
  - read_file
  - invoke_team
  - list_profiles
memory_scope: project
handoff_mode: artifact_first_brief
---
```

### implementer_backend

```yaml
---
model: claude-sonnet-4-6
system: |
  You are a backend implementer. Write clean, well-tested Python/Go/Rust code.
  Follow existing patterns. Always run tests before marking work done.
tools:
  - read_file
  - write_file
  - run_command
  - run_tests
memory_scope: project
handoff_mode: artifact_first_brief
---
```

### tester / reviewer / research_worker / integration_worker

See the template files in `src/pi_agent_os/pi_agents/` for complete frontmatter.

## Team support

`invoke_team` maps to the `pi-subagents` extension (`npm install -g @tintinweb/pi-subagents`). It spawns multiple PI agents in parallel according to a team template definition. Only L1 agents (chief_of_staff, per spec §4.1) may call `invoke_team`.

```python
from pi_agent_os.worker.pi_adapter import get_pi_runtime

runtime = get_pi_runtime()
instance_id = runtime.invoke_team(
    template_id="implementation_team",
    task_packet={"goal": "implement feature X", "issue_id": "iss_..."},
)
```

## Troubleshooting

**`pi` not found in PATH**
Run `npm install -g @mariozechner/pi-coding-agent` and ensure your npm global bin directory is on PATH. Check with `which pi`.

**RPC timeout**
Increase the timeout: `PIRPCBridge(timeout=120.0)`. Also check that `pi --rpc` works interactively in your terminal.

**`team.invoke` returns error "extension not found"**
Install the subagent extension: `npm install -g @tintinweb/pi-subagents`.

**Import error on `pi_rpc_bridge`**
The module has no external Python dependencies beyond the standard library. Ensure your virtual environment is active (`uv run python -c "import pi_agent_os.worker.pi_rpc_bridge"`).

**Process exits unexpectedly**
Check stderr output from the PI process. The reader thread logs warnings to the `pi_agent_os.worker.pi_rpc_bridge` logger — enable DEBUG logging to see them:
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

**Tests fail after enabling real PI runtime**
The test suite uses `StubPIRuntimeAdapter`. Do not call `auto_configure_pi_runtime()` in test setup. The stub is restored automatically between tests if you use the `pi_runtime` fixture (if provided) or reset with `configure_pi_runtime(StubPIRuntimeAdapter())`.
