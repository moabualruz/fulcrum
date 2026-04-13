"""
Integration tests for the MCP lifecycle tool flow.

These tests exercise start_agent_run → heartbeat_agent_run →
complete/block_agent_run against a real (tmp) SQLite database,
validating that the MCP tools correctly drive the control plane.
"""
from __future__ import annotations
import pytest

from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX, TASK_PREFIX
from pi_agent_os.models.workspace import Workspace
from pi_agent_os.models.project import Project
from pi_agent_os.models.task import Task, TaskStatus
from pi_agent_os.adapters.writers.workspace_writer import WorkspaceWriter
from pi_agent_os.adapters.writers.project_writer import ProjectWriter
from pi_agent_os.adapters.readers.task_read import TaskWriter
from pi_agent_os.adapters.readers.agent_status_read import AgentStatusReadAdapter
from pi_agent_os.db import connection as db


@pytest.fixture
def env(tmp_path):
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    return tmp_path


@pytest.fixture
def ws_id(env):
    ws = Workspace(workspace_id=generate_id(WS_PREFIX), name="MCP Test WS")
    WorkspaceWriter().create(ws)
    return ws.workspace_id


@pytest.fixture
def proj_id(env, ws_id):
    proj = Project(
        project_id=generate_id(PROJ_PREFIX),
        workspace_id=ws_id,
        name="MCP Test Project",
        project_type="non_git",
        root_path="/tmp/mcp-test",
        write_mode="sequential",
    )
    ProjectWriter().create(proj)
    return proj.project_id


@pytest.fixture
def task_id(env, ws_id, proj_id):
    task = Task(
        task_id=generate_id(TASK_PREFIX),
        workspace_id=ws_id,
        project_id=proj_id,
        display_id="T-MCP-001",
        title="Implement login endpoint",
        status=TaskStatus.queued,
    )
    TaskWriter().create(task)
    return task.task_id


def test_mcp_start_run_creates_agent_run(env, ws_id, proj_id, task_id):
    """start_agent_run creates an AgentRun record visible via AgentStatusReadAdapter."""
    from pi_agent_os.mcp.server import start_agent_run

    result = start_agent_run(
        task_id=task_id,
        agent_role="implementer",
        workspace_id=ws_id,
        project_id=proj_id,
    )
    assert "run_id" in result
    assert result["status"] == "running"

    run_id = result["run_id"]
    adapter = AgentStatusReadAdapter()
    run = adapter.get(run_id)
    assert run is not None
    assert run.agent_role == "implementer"
    assert run.task_id == task_id
    assert run.workspace_id == ws_id


def test_mcp_heartbeat_updates_step(env, ws_id, proj_id, task_id):
    """heartbeat_agent_run updates current_step and progress_pct in the DB."""
    from pi_agent_os.mcp.server import start_agent_run, heartbeat_agent_run

    run_result = start_agent_run(
        task_id=task_id,
        agent_role="tester",
        workspace_id=ws_id,
        project_id=proj_id,
    )
    run_id = run_result["run_id"]

    hb = heartbeat_agent_run(
        run_id=run_id,
        workspace_id=ws_id,
        current_step="running_unit_tests",
        progress_pct=40.0,
    )
    assert hb["ok"] is True

    row = db.fetchone("SELECT current_step, progress_pct FROM agent_runs WHERE id=?", (run_id,))
    assert row["current_step"] == "running_unit_tests"
    assert row["progress_pct"] == pytest.approx(40.0)


def test_mcp_complete_run_sets_finished(env, ws_id, proj_id, task_id):
    """complete_agent_run transitions the run to finished status."""
    from pi_agent_os.mcp.server import start_agent_run, complete_agent_run

    run_id = start_agent_run(
        task_id=task_id,
        agent_role="implementer",
        workspace_id=ws_id,
        project_id=proj_id,
    )["run_id"]

    result = complete_agent_run(
        run_id=run_id,
        workspace_id=ws_id,
        output_summary="Login endpoint implemented and tested",
        artifact_paths="src/auth.py,tests/test_auth.py",
    )
    assert result["status"] == "completed"

    row = db.fetchone("SELECT status FROM agent_runs WHERE id=?", (run_id,))
    assert row["status"] == "finished"


def test_mcp_block_run_sets_blocked(env, ws_id, proj_id, task_id):
    """block_agent_run transitions the run to blocked with a stored reason."""
    from pi_agent_os.mcp.server import start_agent_run, block_agent_run

    run_id = start_agent_run(
        task_id=task_id,
        agent_role="implementer",
        workspace_id=ws_id,
        project_id=proj_id,
    )["run_id"]

    result = block_agent_run(
        run_id=run_id,
        workspace_id=ws_id,
        reason="Waiting for DB schema migration from DBA",
    )
    assert result["status"] == "blocked"

    row = db.fetchone("SELECT status, blocker FROM agent_runs WHERE id=?", (run_id,))
    assert row["status"] == "blocked"
    assert "DB schema migration" in row["blocker"]


def test_mcp_full_lifecycle(env, ws_id, proj_id, task_id):
    """Full lifecycle: start → heartbeat × 2 → block → complete."""
    from pi_agent_os.mcp.server import (
        start_agent_run, heartbeat_agent_run,
        block_agent_run, complete_agent_run,
    )

    run_id = start_agent_run(
        task_id=task_id,
        agent_role="implementer",
        workspace_id=ws_id,
        project_id=proj_id,
        pi_run_id="pi-run-e2e-001",
    )["run_id"]
    assert run_id == "pi-run-e2e-001"

    heartbeat_agent_run(run_id=run_id, workspace_id=ws_id, current_step="reading_codebase", progress_pct=10.0)
    heartbeat_agent_run(run_id=run_id, workspace_id=ws_id, current_step="writing_code", progress_pct=50.0)

    block_agent_run(run_id=run_id, workspace_id=ws_id, reason="Needs clarification on auth spec")

    row = db.fetchone("SELECT status, blocker FROM agent_runs WHERE id=?", (run_id,))
    assert row["status"] == "blocked"

    complete_agent_run(run_id=run_id, workspace_id=ws_id, output_summary="Done after clarification")

    row = db.fetchone("SELECT status FROM agent_runs WHERE id=?", (run_id,))
    assert row["status"] == "finished"


def test_mcp_get_workspace_status_reflects_active_run(env, ws_id, proj_id, task_id):
    """get_workspace_status counts the active run correctly."""
    from pi_agent_os.mcp.server import start_agent_run, get_workspace_status

    start_agent_run(
        task_id=task_id,
        agent_role="reviewer",
        workspace_id=ws_id,
        project_id=proj_id,
    )

    status = get_workspace_status(workspace_id=ws_id)
    assert status["workspace_id"] == ws_id
    assert status["active_runs"] >= 1
    assert any(r["role"] == "reviewer" for r in status["runs"])


def test_mcp_build_cos_context_returns_markdown(env, ws_id, proj_id, task_id):
    """build_cos_context returns a non-empty markdown string with project context."""
    from pi_agent_os.mcp.server import build_cos_context

    result = build_cos_context(
        goal="implement authentication system",
        project_id=proj_id,
        workspace_id=ws_id,
    )
    assert "context_markdown" in result
    assert isinstance(result["context_markdown"], str)
    assert len(result["context_markdown"]) > 0
