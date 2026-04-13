# Agent Integration: Full Control + Monitoring (Option A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Claude CLI and Gemini CLI into the PI Agent OS control plane with pre-execution tool interception, MCP-namespaced PI tools, and OTel-based observability.

**Architecture:** MCP server exposes PI-unique tools (tasks, memory, agent) under `mcp__pi-os__*` namespace so Claude and Gemini can call them without name conflicts with built-in tools. Claude's PreToolUse hooks and Gemini's BeforeTool extension hooks route through our policy engine for audit and pre-execution interception. OTel spans on all adapters give unified observability. CoS coherence is solved by injecting full world-state into every chief_of_staff task packet.

**Tech Stack:** Python `mcp` package (FastMCP), FastAPI (already in deps), `opentelemetry-api` + `opentelemetry-sdk`, Claude Code `settings.json` hooks, Gemini `gemini-extension.json` BeforeTool hooks, existing `cos_context.py`, existing `lifecycle.py`.

---

## Scope note

This plan has 5 independently shippable subsystems. If you want to parallelize, split at these boundaries:
- **S1** Tasks 1–4: MCP server
- **S2** Tasks 5–6: Hook interceptor script + Claude integration package
- **S3** Task 7: Gemini integration package
- **S4** Tasks 8–9: OTel instrumentation
- **S5** Task 10: CoS coherence wiring

Each subsystem can be tested and committed independently before the next starts.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `pyproject.toml` | Modify | Add `mcp`, `opentelemetry-*` deps |
| `src/pi_agent_os/mcp/__init__.py` | Create | Package marker |
| `src/pi_agent_os/mcp/server.py` | Create | FastMCP server exposing PI tools |
| `src/pi_agent_os/mcp/__main__.py` | Create | `python -m pi_agent_os.mcp.server` entry |
| `src/pi_agent_os/hooks/__init__.py` | Create | Package marker |
| `src/pi_agent_os/hooks/claude_hook.py` | Create | PreToolUse command hook (stdin JSON → policy → exit code) |
| `src/pi_agent_os/telemetry/__init__.py` | Create | Package marker |
| `src/pi_agent_os/telemetry/spans.py` | Create | `agent_span()` context manager, GenAI OTel conventions |
| `src/pi_agent_os/worker/pi_rpc_bridge.py` | Modify | Wrap spawn/wait with OTel spans |
| `src/pi_agent_os/worker/cli_chat_adapter.py` | Modify | Wrap spawn/wait with OTel spans |
| `src/pi_agent_os/worker/lifecycle.py` | Modify | Inject CoS world-state for chief_of_staff runs |
| `src/pi_agent_os/cli/commands/serve.py` | Create | `pi serve-mcp` + `pi serve-hooks` CLI commands |
| `src/pi_agent_os/cli/main.py` | Modify | Register serve commands |
| `agent-integration/claude/CLAUDE.md` | Create | Rules injected into every Claude session |
| `agent-integration/claude/.mcp.json` | Create | MCP server registration (project-scoped) |
| `agent-integration/claude/settings-hooks-snippet.json` | Create | Hooks config snippet for `~/.claude/settings.json` |
| `agent-integration/claude/install.sh` | Create | Copies CLAUDE.md, merges .mcp.json, patches settings |
| `agent-integration/gemini/GEMINI.md` | Create | Rules injected into every Gemini session |
| `agent-integration/gemini/gemini-extension.json` | Create | Extension manifest with BeforeTool hook |
| `agent-integration/gemini/install.sh` | Create | Registers extension in `~/.gemini/extensions/` |
| `tests/unit/test_mcp_server.py` | Create | MCP tool correctness tests |
| `tests/unit/test_claude_hook.py` | Create | Hook allow/deny logic tests |
| `tests/unit/test_telemetry.py` | Create | Span context manager + attribute tests |

---

## Task 1: Add Dependencies

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Write the test that will fail until deps are importable**

Create `tests/unit/test_deps.py`:

```python
def test_mcp_importable():
    import mcp.server.fastmcp  # noqa: F401

def test_otel_importable():
    from opentelemetry import trace  # noqa: F401
    from opentelemetry.sdk.trace import TracerProvider  # noqa: F401
    from opentelemetry.semconv._incubating.attributes.gen_ai_attributes import (
        GEN_AI_SYSTEM,
    )  # noqa: F401
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/unit/test_deps.py -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Add dependencies to pyproject.toml**

Add to the `dependencies` list in `pyproject.toml`:

```toml
    # MCP tool server
    "mcp>=1.0",
    # OpenTelemetry observability
    "opentelemetry-api>=1.25",
    "opentelemetry-sdk>=1.25",
    "opentelemetry-semantic-conventions>=0.46b0",
```

- [ ] **Step 4: Install**

```bash
uv sync
```
Expected: resolves and installs without conflict

- [ ] **Step 5: Run test to verify it passes**

```bash
python -m pytest tests/unit/test_deps.py -v
```
Expected: PASS (both imports succeed)

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml uv.lock tests/unit/test_deps.py
git commit -m "feat(deps): add mcp and opentelemetry packages"
```

---

## Task 2: MCP Server — Task Tools

**Files:**
- Create: `src/pi_agent_os/mcp/__init__.py`
- Create: `src/pi_agent_os/mcp/server.py`
- Test: `tests/unit/test_mcp_server.py`

- [ ] **Step 1: Write failing tests for task tools**

Create `tests/unit/test_mcp_server.py`:

```python
"""Tests for MCP server task tools.

Uses the MCP test client to call tools directly without subprocess.
"""
import pytest
from unittest.mock import MagicMock, patch


def _make_mock_task(task_id="tsk-001", title="Test task", status="todo"):
    t = MagicMock()
    t.task_id = task_id
    t.title = title
    t.description = "desc"
    t.status = MagicMock()
    t.status.value = status
    t.priority = "medium"
    t.assigned_agent_id = None
    t.blockers = []
    t.done_criteria = None
    return t


@pytest.fixture
def mock_task_reader():
    with patch("pi_agent_os.mcp.server._task_reader") as m:
        m.list.return_value = [_make_mock_task()]
        yield m


@pytest.fixture
def mock_task_writer():
    with patch("pi_agent_os.mcp.server._task_writer") as m:
        created = []
        def _create(task):
            created.append(task)
        m.create.side_effect = _create
        m.created = created
        yield m


def test_list_tasks_returns_list(mock_task_reader):
    from pi_agent_os.mcp.server import list_tasks
    result = list_tasks(project_id="proj-1", workspace_id="ws-1")
    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0]["task_id"] == "tsk-001"
    assert result[0]["title"] == "Test task"
    assert result[0]["status"] == "todo"


def test_create_task_returns_task_id(mock_task_writer):
    from pi_agent_os.mcp.server import create_task
    result = create_task(
        title="Build login page",
        project_id="proj-1",
        workspace_id="ws-1",
        description="OAuth2 login screen",
        priority="high",
        assigned_to="implementer_frontend",
    )
    assert "task_id" in result
    assert result["title"] == "Build login page"
    assert mock_task_writer.create.called


def test_update_task_calls_writer():
    with patch("pi_agent_os.mcp.server._task_writer") as m:
        from pi_agent_os.mcp.server import update_task
        result = update_task(task_id="tsk-001", status="in_progress", note="Starting work")
        m.update.assert_called_once_with("tsk-001", {"status": "in_progress", "blockers": ["Starting work"]})
        assert result["updated"] is True
```

- [ ] **Step 2: Run to verify tests fail**

```bash
python -m pytest tests/unit/test_mcp_server.py -v
```
Expected: `ModuleNotFoundError: No module named 'pi_agent_os.mcp.server'`

- [ ] **Step 3: Create the package and server**

Create `src/pi_agent_os/mcp/__init__.py` (empty):
```python
```

Create `src/pi_agent_os/mcp/server.py`:

```python
"""
PI Agent OS MCP Tool Server.

Exposes PI-unique control plane tools under the `pi-os` MCP namespace.
Claude and Gemini tools see these as `mcp__pi-os__create_task` etc.,
avoiding name conflicts with built-in CLI tools.

Run:
    python -m pi_agent_os.mcp.server
    # or via CLI:
    pi serve-mcp
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger(__name__)

# Lazy singletons — initialised on first tool call so the module can be
# imported without a live database (important for tests).
_task_reader = None
_task_writer = None
_memory_facade = None


def _get_task_reader():
    global _task_reader
    if _task_reader is None:
        from ..adapters.readers.task_read import TaskReadAdapter
        _task_reader = TaskReadAdapter()
    return _task_reader


def _get_task_writer():
    global _task_writer
    if _task_writer is None:
        from ..adapters.readers.task_read import TaskWriter
        _task_writer = TaskWriter()
    return _task_writer


def _get_memory_facade():
    global _memory_facade
    if _memory_facade is None:
        from ..memory.facade import MemoryFacade
        _memory_facade = MemoryFacade()
    return _memory_facade


# ---------------------------------------------------------------------------
# Build the MCP server
# ---------------------------------------------------------------------------

from mcp.server.fastmcp import FastMCP  # noqa: E402

mcp = FastMCP("pi-os", instructions=(
    "PI Agent OS control plane tools. Use these to manage tasks, recall "
    "project memory, and interact with the PI agent runtime. "
    "Always pass project_id and workspace_id when calling task tools."
))


# ---------------------------------------------------------------------------
# Task tools
# ---------------------------------------------------------------------------

@mcp.tool()
def list_tasks(
    project_id: str,
    workspace_id: str,
    status: str = "",
    limit: int = 40,
) -> list[dict]:
    """List tasks for a project, optionally filtered by status."""
    reader = _get_task_reader()
    filters: dict = {"project_id": project_id, "workspace_id": workspace_id}
    if status:
        filters["status"] = status
    tasks = reader.list(filters, limit=limit)
    return [
        {
            "task_id": t.task_id,
            "title": t.title,
            "description": t.description or "",
            "status": t.status.value if hasattr(t.status, "value") else str(t.status),
            "priority": t.priority or "medium",
            "assigned_to": t.assigned_agent_id or "",
            "blockers": t.blockers or [],
            "done_criteria": t.done_criteria or "",
        }
        for t in tasks
    ]


@mcp.tool()
def create_task(
    title: str,
    project_id: str,
    workspace_id: str,
    description: str = "",
    priority: str = "medium",
    assigned_to: str = "",
    done_criteria: str = "",
) -> dict:
    """Create a new task in the project. Returns the created task."""
    from ..models.task import Task, TaskStatus
    from ..ids import generate_id, TASK_PREFIX

    writer = _get_task_writer()
    task = Task(
        task_id=generate_id(TASK_PREFIX),
        workspace_id=workspace_id,
        project_id=project_id,
        display_id=f"T-{datetime.now(timezone.utc).strftime('%H%M%S')}",
        title=title,
        description=description,
        status=TaskStatus.todo,
        priority=priority,
        assigned_agent_id=assigned_to or None,
        done_criteria=done_criteria or None,
    )
    writer.create(task)
    log.info("mcp__pi-os__create_task: %s %s", task.task_id, title)
    return {
        "task_id": task.task_id,
        "title": task.title,
        "status": task.status.value,
        "priority": task.priority,
        "assigned_to": task.assigned_agent_id or "",
    }


@mcp.tool()
def update_task(
    task_id: str,
    status: str = "",
    note: str = "",
    assigned_to: str = "",
) -> dict:
    """Update a task's status, note/blocker, or assignment."""
    writer = _get_task_writer()
    updates: dict = {}
    if status:
        updates["status"] = status
    if note:
        updates["blockers"] = [note]
    if assigned_to:
        updates["assigned_agent_id"] = assigned_to
    if updates:
        writer.update(task_id, updates)
        log.info("mcp__pi-os__update_task: %s %s", task_id, updates)
    return {"task_id": task_id, "updated": True, "changes": list(updates.keys())}
```

- [ ] **Step 4: Patch tests to use module-level singletons**

The tests patch `pi_agent_os.mcp.server._task_reader` and `_task_writer` — these are the module-level names the tools access via `_get_task_reader()` / `_get_task_writer()`. For the tests to patch correctly, call the functions directly without the lazy-init guard. Update the test fixtures to patch the getter functions instead:

```python
# In test_mcp_server.py, change fixtures to:
@pytest.fixture
def mock_task_reader():
    with patch("pi_agent_os.mcp.server._get_task_reader") as m:
        reader = MagicMock()
        reader.list.return_value = [_make_mock_task()]
        m.return_value = reader
        yield reader

@pytest.fixture
def mock_task_writer():
    with patch("pi_agent_os.mcp.server._get_task_writer") as m:
        writer = MagicMock()
        m.return_value = writer
        yield writer
```

- [ ] **Step 5: Run tests**

```bash
python -m pytest tests/unit/test_mcp_server.py -v
```
Expected: 3 PASS

- [ ] **Step 6: Commit**

```bash
git add src/pi_agent_os/mcp/ tests/unit/test_mcp_server.py
git commit -m "feat(mcp): MCP server task tools (list, create, update)"
```

---

## Task 3: MCP Server — Memory + Agent Tools

**Files:**
- Modify: `src/pi_agent_os/mcp/server.py`
- Create: `src/pi_agent_os/mcp/__main__.py`
- Modify: `tests/unit/test_mcp_server.py`

- [ ] **Step 1: Write failing tests for memory + agent tools**

Append to `tests/unit/test_mcp_server.py`:

```python
def test_recall_memory_returns_list():
    with patch("pi_agent_os.mcp.server._get_memory_facade") as m:
        facade = MagicMock()
        facade.recall.return_value = [
            {"content": "We use SQLite for the control plane", "score": 0.9}
        ]
        m.return_value = facade
        from pi_agent_os.mcp.server import recall_memory
        result = recall_memory(query="database choice", project_id="proj-1", limit=5)
        assert isinstance(result, list)
        assert result[0]["content"] == "We use SQLite for the control plane"
        facade.recall.assert_called_once_with(
            "database choice", scope="project", scope_id="proj-1", limit=5
        )


def test_write_memory_returns_ok():
    with patch("pi_agent_os.mcp.server._get_memory_facade") as m:
        facade = MagicMock()
        m.return_value = facade
        from pi_agent_os.mcp.server import write_memory
        result = write_memory(
            content="Decision: use SQLite not Postgres",
            project_id="proj-1",
            workspace_id="ws-1",
            tags="decision,architecture",
        )
        assert result["saved"] is True
        facade.write.assert_called_once()


def test_list_profiles_returns_list():
    with patch("pi_agent_os.mcp.server._get_pi_runtime") as m:
        rt = MagicMock()
        rt.list_profiles.return_value = [{"profile_id": "chief_of_staff"}]
        m.return_value = rt
        from pi_agent_os.mcp.server import list_agent_profiles
        result = list_agent_profiles()
        assert result[0]["profile_id"] == "chief_of_staff"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/unit/test_mcp_server.py::test_recall_memory_returns_list -v
```
Expected: `ImportError` — `recall_memory` not defined yet

- [ ] **Step 3: Add memory + agent tools to server.py**

Append to `src/pi_agent_os/mcp/server.py`:

```python
# ---------------------------------------------------------------------------
# Memory tools
# ---------------------------------------------------------------------------

@mcp.tool()
def recall_memory(
    query: str,
    project_id: str,
    limit: int = 10,
    mode: str = "semantic",
) -> list[dict]:
    """Recall relevant memories from the project memory store."""
    facade = _get_memory_facade()
    memories = facade.recall(query, scope="project", scope_id=project_id, limit=limit)
    results = []
    for m in memories:
        if isinstance(m, dict):
            results.append({
                "content": str(m.get("content", m))[:500],
                "score": float(m.get("score", 0.0)),
                "tags": m.get("tags", []),
            })
        else:
            results.append({"content": str(m)[:500], "score": 0.0, "tags": []})
    return results


@mcp.tool()
def write_memory(
    content: str,
    project_id: str,
    workspace_id: str,
    tags: str = "",
) -> dict:
    """Write a memory note to the project memory store."""
    facade = _get_memory_facade()
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    facade.write(
        content=content,
        scope="project",
        scope_id=project_id,
        tags=tag_list,
    )
    log.info("mcp__pi-os__write_memory: project=%s len=%d", project_id, len(content))
    return {"saved": True, "project_id": project_id, "tags": tag_list}


# ---------------------------------------------------------------------------
# Agent runtime tools
# ---------------------------------------------------------------------------

_pi_runtime = None


def _get_pi_runtime():
    global _pi_runtime
    if _pi_runtime is None:
        from ..worker.pi_adapter import get_pi_runtime
        _pi_runtime = get_pi_runtime()
    return _pi_runtime


@mcp.tool()
def list_agent_profiles() -> list[dict]:
    """List available PI agent profiles (roles)."""
    return _get_pi_runtime().list_profiles()


@mcp.tool()
def get_agent_run_status(run_id: str) -> dict:
    """Get the live status of a PI agent run."""
    return _get_pi_runtime().get_run_status(run_id)
```

- [ ] **Step 4: Create the module entry point**

Create `src/pi_agent_os/mcp/__main__.py`:

```python
"""
Run the PI Agent OS MCP server.

    python -m pi_agent_os.mcp.server
"""
from .server import mcp

if __name__ == "__main__":
    mcp.run()
```

- [ ] **Step 5: Run all MCP tests**

```bash
python -m pytest tests/unit/test_mcp_server.py -v
```
Expected: 6 PASS

- [ ] **Step 6: Smoke-test the server starts**

```bash
timeout 3 python -m pi_agent_os.mcp.server 2>&1 | head -5 || true
```
Expected: no crash (may output MCP startup lines or exit gracefully on timeout)

- [ ] **Step 7: Commit**

```bash
git add src/pi_agent_os/mcp/ tests/unit/test_mcp_server.py
git commit -m "feat(mcp): add memory + agent tools, add __main__ entry point"
```

---

## Task 4: Claude Pre-Tool Hook Script

**Files:**
- Create: `src/pi_agent_os/hooks/__init__.py`
- Create: `src/pi_agent_os/hooks/claude_hook.py`
- Test: `tests/unit/test_claude_hook.py`

This script is registered as a Claude Code `PreToolUse` hook. Claude Code runs it before every tool call, passing JSON on stdin. The script:
1. Reads the tool call from stdin
2. Logs it to the event store
3. Runs a policy check
4. Exits 0 (allow) or 2 (deny, with reason on stderr)

- [ ] **Step 1: Write failing tests**

Create `tests/unit/test_claude_hook.py`:

```python
"""Tests for Claude PreToolUse hook logic."""
import json
import sys
from io import StringIO
from unittest.mock import patch, MagicMock
import pytest


ALLOW_EVENT = {
    "session_id": "sess-001",
    "hook_event_name": "PreToolUse",
    "tool_name": "Bash",
    "tool_input": {"command": "ls -la"},
}

DENY_EVENT = {
    "session_id": "sess-001",
    "hook_event_name": "PreToolUse",
    "tool_name": "Bash",
    "tool_input": {"command": "rm -rf /"},
}


def run_hook(event: dict):
    """Run the hook with mock stdin, capture exit code and stderr."""
    from pi_agent_os.hooks.claude_hook import handle_hook
    return handle_hook(event)


def test_allow_returns_zero():
    with patch("pi_agent_os.hooks.claude_hook._policy_check") as mock_check:
        mock_check.return_value = MagicMock(allowed=True, reason="")
        with patch("pi_agent_os.hooks.claude_hook._log_event"):
            code, msg = run_hook(ALLOW_EVENT)
    assert code == 0


def test_deny_returns_two():
    with patch("pi_agent_os.hooks.claude_hook._policy_check") as mock_check:
        mock_check.return_value = MagicMock(allowed=False, reason="Dangerous command blocked")
        with patch("pi_agent_os.hooks.claude_hook._log_event"):
            code, msg = run_hook(DENY_EVENT)
    assert code == 2
    assert "Dangerous command blocked" in msg


def test_unknown_tool_is_allowed():
    event = {**ALLOW_EVENT, "tool_name": "mcp__pi-os__create_task",
             "tool_input": {"title": "fix bug", "project_id": "p1", "workspace_id": "w1"}}
    with patch("pi_agent_os.hooks.claude_hook._policy_check") as mock_check:
        mock_check.return_value = MagicMock(allowed=True, reason="")
        with patch("pi_agent_os.hooks.claude_hook._log_event"):
            code, _ = run_hook(event)
    assert code == 0


def test_log_event_called():
    with patch("pi_agent_os.hooks.claude_hook._policy_check") as mock_check:
        mock_check.return_value = MagicMock(allowed=True, reason="")
        with patch("pi_agent_os.hooks.claude_hook._log_event") as mock_log:
            run_hook(ALLOW_EVENT)
    mock_log.assert_called_once()
    call_kwargs = mock_log.call_args
    assert call_kwargs is not None
```

- [ ] **Step 2: Run to verify tests fail**

```bash
python -m pytest tests/unit/test_claude_hook.py -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Create the hook package + script**

Create `src/pi_agent_os/hooks/__init__.py` (empty):
```python
```

Create `src/pi_agent_os/hooks/claude_hook.py`:

```python
"""
Claude Code PreToolUse hook.

Claude Code runs this script before every tool execution, passing a JSON
blob on stdin describing the tool call. This script:

  - Logs the call to the pi-agent-os event store
  - Runs a policy check (secret guard, deny rules)
  - Exits 0 → Claude proceeds
  - Exits 2 → Claude receives stderr as an error and does NOT run the tool

Register in ~/.claude/settings.json:

    {
      "hooks": {
        "PreToolUse": [{
          "matcher": "*",
          "hooks": [{
            "type": "command",
            "command": "python -m pi_agent_os.hooks.claude_hook"
          }]
        }]
      }
    }

Or use the project-level .claude/settings.json for project-scoped hooks.
"""
from __future__ import annotations

import json
import logging
import sys
from typing import Optional

log = logging.getLogger(__name__)


def _log_event(tool_name: str, tool_input: dict, session_id: str) -> None:
    """Log the tool call to the event store (best-effort)."""
    try:
        from ..events.store import emit
        from ..models.events import EventType
        emit(
            EventType.task_created,   # closest generic event
            workspace_id=None,
            project_id=None,
            actor_type="agent",
            actor_id=f"claude/{session_id[:8]}",
            object_type="tool_call",
            object_id=None,
            payload={
                "tool_name": tool_name,
                "tool_input_keys": list(tool_input.keys()),
                "session_id": session_id,
            },
        )
    except Exception as exc:
        log.debug("Event log unavailable: %s", exc)


def _policy_check(tool_name: str, tool_input: dict) -> object:
    """Run the policy engine on this tool call."""
    try:
        from ..policy.engine import check as engine_check
        return engine_check(
            action=f"tool_use:{tool_name}",
            resource=tool_name,
            actor_id="claude",
            payload=tool_input,
        )
    except Exception as exc:
        log.debug("Policy engine unavailable: %s", exc)

        class _Allow:
            allowed = True
            reason = ""

        return _Allow()


def handle_hook(event: dict) -> tuple[int, str]:
    """
    Process a PreToolUse event.

    Returns (exit_code, message):
      (0, "")    → allow
      (2, msg)   → deny, msg goes to stderr → Claude sees it as tool error
    """
    tool_name = event.get("tool_name", "")
    tool_input = event.get("tool_input", {})
    session_id = event.get("session_id", "unknown")

    _log_event(tool_name, tool_input, session_id)

    result = _policy_check(tool_name, tool_input)
    if not result.allowed:
        return 2, f"[pi-os policy] Tool call denied: {result.reason}"

    return 0, ""


def main() -> None:
    """Entry point: read JSON from stdin, decide, exit with code."""
    raw = sys.stdin.read().strip()
    if not raw:
        sys.exit(0)

    try:
        event = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"[pi-os hook] Failed to parse hook event: {exc}", file=sys.stderr)
        sys.exit(0)   # Don't block Claude on parse errors

    exit_code, message = handle_hook(event)
    if message:
        print(message, file=sys.stderr)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/unit/test_claude_hook.py -v
```
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/pi_agent_os/hooks/ tests/unit/test_claude_hook.py
git commit -m "feat(hooks): Claude PreToolUse hook script with policy check + event logging"
```

---

## Task 5: Claude Integration Package

**Files:**
- Create: `agent-integration/claude/CLAUDE.md`
- Create: `agent-integration/claude/.mcp.json`
- Create: `agent-integration/claude/settings-hooks-snippet.json`
- Create: `agent-integration/claude/install.sh`

No tests for config files — verified by install + smoke test.

- [ ] **Step 1: Create CLAUDE.md**

Create `agent-integration/claude/CLAUDE.md`:

```markdown
# PI Agent OS — Claude Integration Rules

You are operating as part of the PI Agent OS multi-agent system.

## Tool Naming

PI Agent OS tools are available under the `mcp__pi-os__` namespace:

- `mcp__pi-os__list_tasks` — list project tasks
- `mcp__pi-os__create_task` — create a new task
- `mcp__pi-os__update_task` — update task status or note
- `mcp__pi-os__recall_memory` — recall project memories by semantic query
- `mcp__pi-os__write_memory` — write a memory note to the project store
- `mcp__pi-os__list_agent_profiles` — list available agent roles
- `mcp__pi-os__get_agent_run_status` — check status of a running agent

Do NOT use generic file or bash tools to write to the project control plane.
Always use `mcp__pi-os__*` tools for tasks, memory, and agent calls.

## Role Boundaries

- You operate within an assigned role (chief_of_staff, implementer, tester, etc.)
- The chief_of_staff is the only role permitted to create or invoke teams
- Do not bypass task creation for non-trivial work
- Produce structured outputs the control plane can parse

## Response Format for Chief of Staff

When operating as chief_of_staff, end every response with a JSON block:

```json
{
  "thinking": "...",
  "decisions": ["..."],
  "create_tasks": [],
  "update_tasks": [],
  "memory_notes": [],
  "done": false
}
```

## Security

All tool calls are intercepted by the pi-os policy engine.
If a tool call is blocked, the reason will appear as a tool error — do not retry blocked operations.
```

- [ ] **Step 2: Create .mcp.json**

Create `agent-integration/claude/.mcp.json`:

```json
{
  "mcpServers": {
    "pi-os": {
      "command": "python",
      "args": ["-m", "pi_agent_os.mcp.server"],
      "env": {}
    }
  }
}
```

- [ ] **Step 3: Create settings hooks snippet**

Create `agent-integration/claude/settings-hooks-snippet.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "python -m pi_agent_os.hooks.claude_hook"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Create install script**

Create `agent-integration/claude/install.sh`:

```bash
#!/usr/bin/env bash
# Installs the PI Agent OS Claude integration.
# Run from the pi-stack-plan repo root.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
PROJECT_CLAUDE_DIR="$REPO_ROOT/.claude"

echo "==> Installing PI Agent OS Claude integration"

# 1. Copy CLAUDE.md to project root .claude/
mkdir -p "$PROJECT_CLAUDE_DIR"
cp "$SCRIPT_DIR/CLAUDE.md" "$PROJECT_CLAUDE_DIR/CLAUDE.md"
echo "    Wrote $PROJECT_CLAUDE_DIR/CLAUDE.md"

# 2. Copy .mcp.json to project root (project-scoped MCP)
cp "$SCRIPT_DIR/.mcp.json" "$REPO_ROOT/.mcp.json"
echo "    Wrote $REPO_ROOT/.mcp.json"

# 3. Merge hooks into ~/.claude/settings.json
if [ ! -f "$CLAUDE_SETTINGS" ]; then
  echo "{}" > "$CLAUDE_SETTINGS"
fi

python3 - <<'PYEOF'
import json, sys
from pathlib import Path

settings_path = Path.home() / ".claude" / "settings.json"
snippet_path = Path(__file__).parent / "settings-hooks-snippet.json" if False else None
import os
snippet_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "settings-hooks-snippet.json")

with open(settings_path) as f:
    settings = json.load(f)

with open(snippet_path) as f:
    snippet = json.load(f)

# Merge hooks: append pi-os hooks under PreToolUse without duplicating
hooks = settings.setdefault("hooks", {})
existing_pre = hooks.setdefault("PreToolUse", [])
pi_os_hook = snippet["hooks"]["PreToolUse"][0]

# Remove any existing pi-os entry before re-adding
existing_pre[:] = [
    h for h in existing_pre
    if not any(
        cmd.get("command", "").find("pi_agent_os.hooks") >= 0
        for cmd in h.get("hooks", [])
    )
]
existing_pre.append(pi_os_hook)

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)
print(f"    Merged hooks into {settings_path}")
PYEOF

echo ""
echo "==> Done. Claude will now:"
echo "    - See PI Agent OS tools as mcp__pi-os__*"
echo "    - Route all tool calls through the pi-os policy engine"
echo "    - Inject CLAUDE.md rules from .claude/CLAUDE.md"
```

- [ ] **Step 5: Make install script executable**

```bash
chmod +x agent-integration/claude/install.sh
```

- [ ] **Step 6: Dry-run the install (don't actually patch settings in CI)**

```bash
# Verify the files were created correctly
cat agent-integration/claude/.mcp.json | python3 -c "import json,sys; json.load(sys.stdin); print('valid JSON')"
cat agent-integration/claude/settings-hooks-snippet.json | python3 -c "import json,sys; json.load(sys.stdin); print('valid JSON')"
```
Expected: both print `valid JSON`

- [ ] **Step 7: Commit**

```bash
git add agent-integration/claude/
git commit -m "feat(claude): Claude integration package (CLAUDE.md, .mcp.json, hook install)"
```

---

## Task 6: Gemini Integration Package

**Files:**
- Create: `agent-integration/gemini/GEMINI.md`
- Create: `agent-integration/gemini/gemini-extension.json`
- Create: `agent-integration/gemini/install.sh`

- [ ] **Step 1: Create GEMINI.md**

Create `agent-integration/gemini/GEMINI.md`:

```markdown
# PI Agent OS — Gemini Integration Rules

You are operating as part of the PI Agent OS multi-agent system.

## Tool Naming

PI Agent OS tools are available via MCP under the `mcp_pi-os_` namespace
(Gemini uses underscores, not double-underscore):

- `mcp_pi-os_list_tasks`
- `mcp_pi-os_create_task`
- `mcp_pi-os_update_task`
- `mcp_pi-os_recall_memory`
- `mcp_pi-os_write_memory`
- `mcp_pi-os_list_agent_profiles`
- `mcp_pi-os_get_agent_run_status`

Always use `mcp_pi-os_*` tools for tasks, memory, and agent calls.
Do NOT use shell/file tools to write to the project control plane.

## Role Boundaries

- You operate within an assigned role defined in your system prompt
- Chief of Staff is the only role that may create or invoke teams
- Produce structured JSON outputs that the control plane can parse

## Response Format for Chief of Staff

When operating as chief_of_staff, end every response with a JSON block:

```json
{
  "thinking": "...",
  "decisions": ["..."],
  "create_tasks": [],
  "update_tasks": [],
  "memory_notes": [],
  "done": false
}
```

## Security

All tool calls pass through the pi-os BeforeTool hook.
Blocked operations will appear as tool errors — do not retry them.
```

- [ ] **Step 2: Create gemini-extension.json**

Create `agent-integration/gemini/gemini-extension.json`:

```json
{
  "name": "pi-os",
  "version": "1.0.0",
  "description": "PI Agent OS control plane integration for Gemini CLI",
  "contextFileName": "GEMINI.md",
  "mcpServers": [
    {
      "name": "pi-os",
      "command": "python",
      "args": ["-m", "pi_agent_os.mcp.server"],
      "trust": true
    }
  ],
  "hooks": {
    "BeforeTool": {
      "command": "python -m pi_agent_os.hooks.gemini_hook"
    }
  }
}
```

- [ ] **Step 3: Create Gemini BeforeTool hook**

Create `src/pi_agent_os/hooks/gemini_hook.py`:

```python
"""
Gemini CLI BeforeTool hook.

Gemini CLI calls this script before each tool execution, passing a JSON
blob on stdin. Mirrors the Claude hook but adapted for Gemini's event format.

Register via gemini-extension.json:
    "hooks": { "BeforeTool": { "command": "python -m pi_agent_os.hooks.gemini_hook" } }
"""
from __future__ import annotations

import json
import sys

from .claude_hook import handle_hook   # reuse identical logic


def main() -> None:
    raw = sys.stdin.read().strip()
    if not raw:
        sys.exit(0)

    try:
        event = json.loads(raw)
    except json.JSONDecodeError:
        sys.exit(0)

    # Gemini BeforeTool event shape may differ slightly from Claude's.
    # Normalise to the same dict shape handle_hook expects.
    normalised = {
        "session_id": event.get("session_id", event.get("conversationId", "unknown")),
        "hook_event_name": "PreToolUse",
        "tool_name": event.get("tool_name", event.get("toolName", "")),
        "tool_input": event.get("tool_input", event.get("toolInput", event.get("args", {}))),
    }

    exit_code, message = handle_hook(normalised)
    if message:
        print(message, file=sys.stderr)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Create install script**

Create `agent-integration/gemini/install.sh`:

```bash
#!/usr/bin/env bash
# Installs the PI Agent OS Gemini CLI extension.
# Run from the pi-stack-plan repo root.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GEMINI_EXT_DIR="$HOME/.gemini/extensions/pi-os"

echo "==> Installing PI Agent OS Gemini extension"

# 1. Create extension directory
mkdir -p "$GEMINI_EXT_DIR"

# 2. Copy extension manifest
cp "$SCRIPT_DIR/gemini-extension.json" "$GEMINI_EXT_DIR/gemini-extension.json"
echo "    Wrote $GEMINI_EXT_DIR/gemini-extension.json"

# 3. Copy GEMINI.md to project root (Gemini injects contextFileName from extension dir)
cp "$SCRIPT_DIR/GEMINI.md" "$GEMINI_EXT_DIR/GEMINI.md"
cp "$SCRIPT_DIR/GEMINI.md" "$REPO_ROOT/GEMINI.md"
echo "    Wrote GEMINI.md to extension dir and project root"

echo ""
echo "==> Done. Gemini CLI will now:"
echo "    - Load PI Agent OS MCP tools as mcp_pi-os_*"
echo "    - Route tool calls through BeforeTool hook"
echo "    - Inject GEMINI.md rules in every session"
echo ""
echo "    Activate: gemini (must have run 'gemini' once for OAuth)"
```

- [ ] **Step 5: Make executable + validate JSON**

```bash
chmod +x agent-integration/gemini/install.sh
cat agent-integration/gemini/gemini-extension.json | python3 -c "import json,sys; json.load(sys.stdin); print('valid JSON')"
```
Expected: `valid JSON`

- [ ] **Step 6: Commit**

```bash
git add agent-integration/gemini/ src/pi_agent_os/hooks/gemini_hook.py
git commit -m "feat(gemini): Gemini extension package (GEMINI.md, gemini-extension.json, BeforeTool hook)"
```

---

## Task 7: OTel Telemetry Module

**Files:**
- Create: `src/pi_agent_os/telemetry/__init__.py`
- Create: `src/pi_agent_os/telemetry/spans.py`
- Test: `tests/unit/test_telemetry.py`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/test_telemetry.py`:

```python
"""Tests for OTel telemetry spans."""
import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.sdk.trace.export import SimpleSpanProcessor


@pytest.fixture
def span_exporter():
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    from opentelemetry import trace
    trace.set_tracer_provider(provider)
    yield exporter
    exporter.clear()


def test_agent_span_creates_span(span_exporter):
    from pi_agent_os.telemetry.spans import agent_span
    with agent_span(provider="anthropic", model="claude-sonnet-4-6", profile="chief_of_staff"):
        pass
    spans = span_exporter.get_finished_spans()
    assert len(spans) == 1
    span = spans[0]
    assert span.name == "invoke_agent chief_of_staff"


def test_agent_span_sets_gen_ai_attributes(span_exporter):
    from pi_agent_os.telemetry.spans import agent_span
    with agent_span(provider="anthropic", model="claude-sonnet-4-6", profile="chief_of_staff"):
        pass
    spans = span_exporter.get_finished_spans()
    attrs = dict(spans[0].attributes)
    assert attrs["gen_ai.system"] == "anthropic"
    assert attrs["gen_ai.request.model"] == "claude-sonnet-4-6"
    assert attrs["gen_ai.agent.name"] == "chief_of_staff"
    assert attrs["gen_ai.operation.name"] == "invoke_agent"


def test_agent_span_records_token_usage(span_exporter):
    from pi_agent_os.telemetry.spans import agent_span
    with agent_span(provider="google_gemini", model="gemini-2.5-pro", profile="tester") as span:
        span.set_token_usage(input_tokens=512, output_tokens=128)
    spans = span_exporter.get_finished_spans()
    attrs = dict(spans[0].attributes)
    assert attrs["gen_ai.usage.input_tokens"] == 512
    assert attrs["gen_ai.usage.output_tokens"] == 128


def test_agent_span_records_error(span_exporter):
    from pi_agent_os.telemetry.spans import agent_span
    from opentelemetry.trace import StatusCode
    with pytest.raises(ValueError):
        with agent_span(provider="pi", model="opencode/big-pickle", profile="implementer"):
            raise ValueError("model not found")
    spans = span_exporter.get_finished_spans()
    assert spans[0].status.status_code == StatusCode.ERROR
```

- [ ] **Step 2: Run to verify they fail**

```bash
python -m pytest tests/unit/test_telemetry.py -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Create the telemetry module**

Create `src/pi_agent_os/telemetry/__init__.py` (empty):
```python
```

Create `src/pi_agent_os/telemetry/spans.py`:

```python
"""
OpenTelemetry spans for PI Agent OS.

Uses GenAI semantic conventions:
  gen_ai.system         — provider name (anthropic, google_gemini, pi, openai, ...)
  gen_ai.request.model  — model name
  gen_ai.agent.name     — profile / role
  gen_ai.operation.name — "invoke_agent" | "chat"
  gen_ai.usage.input_tokens
  gen_ai.usage.output_tokens

Usage:
    from pi_agent_os.telemetry.spans import agent_span

    with agent_span(provider="anthropic", model="claude-sonnet-4-6", profile="tester") as s:
        run_id = adapter.spawn_agent(config)
        result = adapter.wait_for_run(run_id)
        s.set_token_usage(input_tokens=result.output.get("input_tokens", 0),
                          output_tokens=result.output.get("output_tokens", 0))
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Optional

from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

_tracer = trace.get_tracer("pi_agent_os", "0.1.0")


class _AgentSpanContext:
    """Thin wrapper around an OTel span with helper methods."""

    def __init__(self, span: trace.Span):
        self._span = span

    def set_token_usage(self, input_tokens: int = 0, output_tokens: int = 0) -> None:
        self._span.set_attribute("gen_ai.usage.input_tokens", input_tokens)
        self._span.set_attribute("gen_ai.usage.output_tokens", output_tokens)

    def set_run_id(self, run_id: str) -> None:
        self._span.set_attribute("gen_ai.agent.run_id", run_id)

    def set_error(self, message: str) -> None:
        self._span.set_status(Status(StatusCode.ERROR, message))


@contextmanager
def agent_span(
    provider: str,
    model: str,
    profile: str,
    operation: str = "invoke_agent",
):
    """
    Context manager that wraps an agent invocation in an OTel span.

    provider:  "anthropic" | "google_gemini" | "pi" | "openai" | ...
    model:     model name (e.g. "claude-sonnet-4-6")
    profile:   agent role / profile_id (e.g. "chief_of_staff")
    operation: "invoke_agent" (default) or "chat"
    """
    span_name = f"{operation} {profile}"
    with _tracer.start_as_current_span(span_name) as span:
        span.set_attribute("gen_ai.system", provider)
        span.set_attribute("gen_ai.request.model", model)
        span.set_attribute("gen_ai.agent.name", profile)
        span.set_attribute("gen_ai.operation.name", operation)

        ctx = _AgentSpanContext(span)
        try:
            yield ctx
        except Exception as exc:
            span.set_status(Status(StatusCode.ERROR, str(exc)))
            span.record_exception(exc)
            raise
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/unit/test_telemetry.py -v
```
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/pi_agent_os/telemetry/ tests/unit/test_telemetry.py
git commit -m "feat(telemetry): OTel agent_span context manager with GenAI semantic conventions"
```

---

## Task 8: Instrument Adapters with OTel Spans

**Files:**
- Modify: `src/pi_agent_os/worker/pi_rpc_bridge.py`
- Modify: `src/pi_agent_os/worker/cli_chat_adapter.py`

- [ ] **Step 1: Add spans to PIRPCBridge**

In `src/pi_agent_os/worker/pi_rpc_bridge.py`, find the `PIRPCBridge.spawn_agent` method. Add span instrumentation around the spawn + wait cycle.

The current `spawn_agent` method creates a subprocess. Wrap the full spawn + wait in a span. Add a new `_spawn_with_span` helper, or instrument `wait_for_run`:

Find the `wait_for_run` method in `PIRPCBridge` and add instrumentation. Insert at the top of the file, after existing imports:

```python
# Telemetry (no-op if opentelemetry not configured)
try:
    from ..telemetry.spans import agent_span as _agent_span
    _HAS_OTEL = True
except ImportError:
    _HAS_OTEL = False
```

Find the `wait_for_run(self, run_id, timeout)` method in `PIRPCBridge` and wrap its body:

```python
def wait_for_run(self, run_id: str, timeout: float | None = None) -> PIRunResult:
    state = self._get_state(run_id)
    # ... (existing body) ...
```

Replace with:

```python
def wait_for_run(self, run_id: str, timeout: float | None = None) -> PIRunResult:
    state = self._get_state(run_id)
    profile_id = getattr(state, "profile_id", "unknown")
    model = getattr(state, "model", "pi/unknown")
    provider = model.split("/")[0] if "/" in model else "pi"

    if _HAS_OTEL:
        from ..telemetry.spans import agent_span
        with agent_span(provider=provider, model=model, profile=profile_id) as s:
            s.set_run_id(run_id)
            result = self._wait_for_run_inner(run_id, timeout, state)
            if result.status != "completed":
                s.set_error(result.error or "run failed")
            return result
    return self._wait_for_run_inner(run_id, timeout, state)
```

Also store `profile_id` and `model` on the `_RPCRunState` (or equivalent state object) when `spawn_agent` is called, so `wait_for_run` can retrieve them.

Read `pi_rpc_bridge.py` to find the exact state class name and `spawn_agent` signature before making this edit, then apply the minimal change:

```bash
grep -n "class _RPC\|class _Run\|def spawn_agent\|def wait_for_run\|profile_id" \
  src/pi_agent_os/worker/pi_rpc_bridge.py | head -20
```

Apply the instrumentation once you know the exact class/method names. The pattern is the same regardless of naming.

- [ ] **Step 2: Add spans to ClaudeCLIAdapter**

In `src/pi_agent_os/worker/cli_chat_adapter.py`, add the same import block at the top:

```python
try:
    from ..telemetry.spans import agent_span as _agent_span
    _HAS_OTEL = True
except ImportError:
    _HAS_OTEL = False
```

Find `ClaudeCLIAdapter.wait_for_run` and wrap its body identically — the model comes from `_resolve_model`, stored on `_CliRunState`. Add `model: str = ""` to `_CliRunState`, then set it in `spawn_agent` just before `state.thread.start()`:

```python
state.model = model
state.profile_id = config.profile_id
```

Then in `wait_for_run`:
```python
def wait_for_run(self, run_id: str, timeout: float | None = None) -> PIRunResult:
    state = self._get_state(run_id)
    if _HAS_OTEL:
        from ..telemetry.spans import agent_span
        with agent_span(
            provider="anthropic",
            model=getattr(state, "model", self._default_model),
            profile=getattr(state, "profile_id", "unknown"),
        ) as s:
            s.set_run_id(run_id)
            result = self._wait_inner(run_id, state, timeout)
            if result.status != "completed":
                s.set_error(result.error or "run failed")
            return result
    return self._wait_inner(run_id, state, timeout)
```

Extract the existing `wait_for_run` body into `_wait_inner(self, run_id, state, timeout)` to avoid duplication.

Apply the same pattern to `GeminiCLIAdapter`.

- [ ] **Step 3: Smoke test — import does not crash**

```bash
python -c "from pi_agent_os.worker.cli_chat_adapter import ClaudeCLIAdapter, GeminiCLIAdapter; print('OK')"
python -c "from pi_agent_os.worker.pi_rpc_bridge import PIRPCBridge; print('OK')"
```
Expected: both print `OK`

- [ ] **Step 4: Run existing adapter tests**

```bash
python -m pytest tests/unit/ -v -k "adapter or bridge or cli" 2>&1 | tail -20
```
Expected: all previously passing tests still PASS

- [ ] **Step 5: Commit**

```bash
git add src/pi_agent_os/worker/pi_rpc_bridge.py src/pi_agent_os/worker/cli_chat_adapter.py
git commit -m "feat(telemetry): instrument PIRPCBridge and CLI adapters with OTel spans"
```

---

## Task 9: CoS Coherence — Wire CoSContextBuilder into WorkerLifecycle

**Files:**
- Modify: `src/pi_agent_os/worker/lifecycle.py`
- Test: `tests/unit/test_cos_wiring.py`

The `CoSContextBuilder` (already in `cos_context.py`) builds a world-state snapshot. `WorkerLifecycle.start()` should inject it into the `chief_of_staff` task packet. `WorkerLifecycle.complete()` should run `CoSResponseParser.apply()` if the run was a CoS run.

- [ ] **Step 1: Write failing tests**

Create `tests/unit/test_cos_wiring.py`:

```python
"""Tests for CoS coherence wiring in WorkerLifecycle."""
import pytest
from unittest.mock import patch, MagicMock


def _make_handoff(goal="Build feature X"):
    from pi_agent_os.models.handoff import HandoffPacket
    h = MagicMock(spec=HandoffPacket)
    h.handoff_id = "hnd-001"
    h.goal = goal
    h.task_type = "planning"
    h.inputs = {}
    h.constraints = []
    h.done_criteria = "feature shipped"
    h.artifact_contract_id = None
    h.handoff_mode = "artifact_first_brief"
    h.task_id = "tsk-001"
    h.from_agent_id = "user"
    return h


def test_chief_of_staff_gets_world_state_injected():
    """task_packet for chief_of_staff should include _instruction with world state."""
    with patch("pi_agent_os.worker.lifecycle.get_pi_runtime") as mock_rt, \
         patch("pi_agent_os.worker.lifecycle.AgentRunWriter"), \
         patch("pi_agent_os.worker.lifecycle.policy_check") as mock_policy, \
         patch("pi_agent_os.worker.lifecycle.Router") as mock_router, \
         patch("pi_agent_os.worker.lifecycle.CoSContextBuilder") as mock_builder:

        mock_policy.return_value = MagicMock(allowed=True)
        mock_router.return_value.resolve.return_value = MagicMock(resolved_profile="chief_of_staff")
        mock_builder.return_value.build.return_value = "## Current Goal\nBuild feature X"

        pi_runtime = MagicMock()
        pi_runtime.spawn_agent.return_value = "run-001"
        mock_rt.return_value = pi_runtime

        from pi_agent_os.worker.lifecycle import WorkerLifecycle
        lc = WorkerLifecycle()
        lc.start(
            handoff=_make_handoff("Build feature X"),
            agent_role="chief_of_staff",
            workspace_id="ws-1",
            project_id="proj-1",
        )

    call_args = pi_runtime.spawn_agent.call_args
    config = call_args[0][0]
    assert "_instruction" in config.task_packet
    assert "Build feature X" in config.task_packet["_instruction"]


def test_non_cos_agent_does_not_get_world_state():
    """Non-CoS agents should NOT have _instruction injected."""
    with patch("pi_agent_os.worker.lifecycle.get_pi_runtime") as mock_rt, \
         patch("pi_agent_os.worker.lifecycle.AgentRunWriter"), \
         patch("pi_agent_os.worker.lifecycle.policy_check") as mock_policy, \
         patch("pi_agent_os.worker.lifecycle.Router") as mock_router, \
         patch("pi_agent_os.worker.lifecycle.CoSContextBuilder") as mock_builder:

        mock_policy.return_value = MagicMock(allowed=True)
        mock_router.return_value.resolve.return_value = MagicMock(resolved_profile="implementer_backend")

        pi_runtime = MagicMock()
        pi_runtime.spawn_agent.return_value = "run-002"
        mock_rt.return_value = pi_runtime

        from pi_agent_os.worker.lifecycle import WorkerLifecycle
        lc = WorkerLifecycle()
        lc.start(
            handoff=_make_handoff("Fix bug"),
            agent_role="implementer_backend",
            workspace_id="ws-1",
            project_id="proj-1",
        )

    mock_builder.assert_not_called()
    config = pi_runtime.spawn_agent.call_args[0][0]
    assert "_instruction" not in config.task_packet
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/unit/test_cos_wiring.py -v
```
Expected: `test_chief_of_staff_gets_world_state_injected` FAIL (no `_instruction` injected yet)

- [ ] **Step 3: Update WorkerLifecycle.start() to inject CoS world state**

In `src/pi_agent_os/worker/lifecycle.py`, add the import at the top:

```python
from .cos_context import CoSContextBuilder
```

In the `start()` method, find the block that builds `task_packet` (lines ~80–90):

```python
        # Build task packet for PI
        task_packet = {
            "handoff_id": handoff.handoff_id,
            "goal": handoff.goal,
            ...
        }
```

Add CoS injection immediately after building `task_packet`:

```python
        # Inject world-state for the Chief of Staff
        if (decision.resolved_profile or agent_role) == "chief_of_staff" and project_id:
            builder = CoSContextBuilder(
                project_id=project_id,
                workspace_id=workspace_id,
            )
            world_state = builder.build(handoff.goal)
            task_packet["_instruction"] = (
                f"You are the Chief of Staff for this project.\n\n{world_state}"
            )
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/unit/test_cos_wiring.py -v
```
Expected: 2 PASS

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
python -m pytest tests/unit/ -v 2>&1 | tail -30
```
Expected: all previously passing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add src/pi_agent_os/worker/lifecycle.py tests/unit/test_cos_wiring.py
git commit -m "feat(cos): inject CoS world-state into chief_of_staff task packets"
```

---

## Task 10: CLI Serve Commands

**Files:**
- Create: `src/pi_agent_os/cli/commands/serve.py`
- Modify: `src/pi_agent_os/cli/main.py`

- [ ] **Step 1: Write failing test for CLI entry point**

Add to `tests/unit/test_cli.py` (create if not present):

```python
def test_serve_mcp_command_importable():
    from pi_agent_os.cli.commands.serve import app as serve_app
    from typer.testing import CliRunner
    runner = CliRunner()
    # --help should always work without starting the server
    result = runner.invoke(serve_app, ["--help"])
    assert result.exit_code == 0
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/unit/test_cli.py::test_serve_mcp_command_importable -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Create serve.py**

Create `src/pi_agent_os/cli/commands/serve.py`:

```python
"""CLI commands for starting PI Agent OS background servers."""
from __future__ import annotations

import typer

app = typer.Typer(help="Start PI Agent OS servers (MCP, hooks)")


@app.command("mcp")
def serve_mcp(
    host: str = typer.Option("127.0.0.1", help="Bind host"),
    port: int = typer.Option(7200, help="Bind port"),
    transport: str = typer.Option("stdio", help="MCP transport: stdio | sse"),
) -> None:
    """Start the PI Agent OS MCP tool server."""
    from ...mcp.server import mcp
    typer.echo(f"Starting PI Agent OS MCP server (transport={transport})")
    if transport == "sse":
        mcp.run(transport="sse", host=host, port=port)
    else:
        mcp.run(transport="stdio")


@app.command("hooks")
def serve_hooks(
    host: str = typer.Option("127.0.0.1", help="Bind host"),
    port: int = typer.Option(7100, help="Bind port"),
) -> None:
    """
    Start an HTTP server that Claude hooks can POST to.

    Useful when you want centralised hook processing rather than running
    the hook script as a subprocess on every tool call.
    Register in ~/.claude/settings.json hooks as:
        {"type": "http", "url": "http://localhost:7100/hooks/pre-tool"}
    """
    import uvicorn
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse

    hook_app = FastAPI(title="pi-os hooks")

    @hook_app.post("/hooks/pre-tool")
    async def pre_tool(request: Request):
        event = await request.json()
        from ...hooks.claude_hook import handle_hook
        exit_code, message = handle_hook(event)
        if exit_code == 0:
            return JSONResponse({"continue": True})
        return JSONResponse({"continue": False, "stopReason": message})

    @hook_app.get("/health")
    def health():
        return {"status": "ok"}

    typer.echo(f"Starting PI Agent OS hook server on http://{host}:{port}")
    uvicorn.run(hook_app, host=host, port=port)


@app.command("all")
def serve_all(
    mcp_port: int = typer.Option(7200, help="MCP SSE port"),
    hooks_port: int = typer.Option(7100, help="Hooks HTTP port"),
) -> None:
    """Start both MCP and hook servers in separate threads."""
    import threading

    def _run_mcp():
        from ...mcp.server import mcp
        mcp.run(transport="sse", host="127.0.0.1", port=mcp_port)

    def _run_hooks():
        import uvicorn
        from fastapi import FastAPI, Request
        from fastapi.responses import JSONResponse

        hook_app = FastAPI(title="pi-os hooks")

        @hook_app.post("/hooks/pre-tool")
        async def pre_tool(request: Request):
            event = await request.json()
            from ...hooks.claude_hook import handle_hook
            code, msg = handle_hook(event)
            return JSONResponse({"continue": code == 0, "stopReason": msg if msg else None})

        @hook_app.get("/health")
        def health():
            return {"status": "ok"}

        uvicorn.run(hook_app, host="127.0.0.1", port=hooks_port)

    mcp_thread = threading.Thread(target=_run_mcp, daemon=True)
    hooks_thread = threading.Thread(target=_run_hooks, daemon=True)

    typer.echo(f"Starting MCP server on port {mcp_port}")
    typer.echo(f"Starting hook server on port {hooks_port}")

    mcp_thread.start()
    hooks_thread.start()

    try:
        mcp_thread.join()
        hooks_thread.join()
    except KeyboardInterrupt:
        typer.echo("Shutting down.")
```

- [ ] **Step 4: Register serve commands in main.py**

Read `src/pi_agent_os/cli/main.py` to find where other sub-apps are added (`app.add_typer(...)`), then add:

```python
from .commands.serve import app as serve_app
app.add_typer(serve_app, name="serve")
```

- [ ] **Step 5: Run test**

```bash
python -m pytest tests/unit/test_cli.py::test_serve_mcp_command_importable -v
```
Expected: PASS

- [ ] **Step 6: Verify CLI help works**

```bash
python -m pi_agent_os.cli.main serve --help
```
Expected: shows `mcp`, `hooks`, `all` subcommands

- [ ] **Step 7: Run full test suite**

```bash
python -m pytest tests/ -v 2>&1 | tail -20
```
Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/pi_agent_os/cli/commands/serve.py src/pi_agent_os/cli/main.py tests/unit/test_cli.py
git commit -m "feat(cli): add 'pi serve mcp|hooks|all' commands"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|---|---|
| PI tools under MCP namespace (no name conflicts) | Tasks 2–3 |
| Claude pre-execution interception | Task 4 |
| Claude plugin package (CLAUDE.md, .mcp.json, hooks) | Task 5 |
| Gemini integration package (extension.json, GEMINI.md) | Task 6 |
| OTel observability across all adapters | Tasks 7–8 |
| CoS coherence (world-state injection) | Task 9 |
| `pi serve` CLI | Task 10 |
| OTel not already in deps | Task 1 |

### Gaps

- **Gemini ACP mode** (switch from `--prompt` to `--acp` JSON-RPC 2.0) — the BeforeTool hook in `gemini-extension.json` achieves pre-execution interception without requiring ACP mode. ACP mode adds persistent multi-turn support and is a worthwhile follow-up once the exact protocol is verified against the installed Gemini CLI version. Leave as a follow-up task.

- **OTel exporter config** — `spans.py` uses whatever `TracerProvider` is configured in the environment. For production use, configure OTLP export via environment variables (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME=pi-agent-os`). No code change needed — this is operational config.

- **CoS response parsing** — `cos_context.py` has `CoSResponseParser.apply()` ready. It needs to be called after the CoS run completes. Wire it into `WorkerLifecycle.complete()` in a follow-up (needs the run result text, which requires storing it on the AgentRun record).

### Type/name consistency check

- `agent_span(provider, model, profile)` — used in Tasks 7, 8 — consistent ✓
- `CoSContextBuilder(project_id, workspace_id)` — used in Task 9, matches `cos_context.py` ✓
- `_get_task_reader()`, `_get_task_writer()`, `_get_memory_facade()`, `_get_pi_runtime()` — all lazy singletons in server.py, patched consistently in tests ✓
- `handle_hook(event) -> (int, str)` — used in Tasks 4, 6, 10 — consistent ✓
