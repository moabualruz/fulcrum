"""Tests for IntegrationWorker artifact gates and merge queue orchestration."""
from __future__ import annotations
import pytest
import tempfile
from pathlib import Path
from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX
from pi_agent_os.worktrees.integration_worker import IntegrationWorker, ArtifactGateError
from pi_agent_os.worktrees.merge_queue import MergeQueue
from pi_agent_os.policy.engine import PolicyDeniedError
import pi_agent_os.db.connection as _dbc


@pytest.fixture
def env(tmp_path):
    if hasattr(_dbc._local, "conn") and _dbc._local.conn is not None:
        try:
            _dbc._local.conn.close()
        except Exception:
            pass
        _dbc._local.conn = None
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    now = "2026-01-01T00:00:00+00:00"
    ws_id = generate_id(WS_PREFIX)
    proj_id = generate_id(PROJ_PREFIX)
    _dbc.execute(
        "INSERT INTO workspaces (id, name, description, config_path, status, created_at, updated_at) "
        "VALUES (?, 'Test WS', '', '', 'active', ?, ?)",
        (ws_id, now, now),
    )
    _dbc.execute(
        "INSERT INTO projects (id, workspace_id, name, description, project_type, root_path, "
        "default_branch, status, write_mode, created_at, updated_at) "
        "VALUES (?, ?, 'Test Project', '', 'non_git', '/tmp', 'main', 'active', 'sequential', ?, ?)",
        (proj_id, ws_id, now, now),
    )
    return {"tmp_path": tmp_path, "ws_id": ws_id, "proj_id": proj_id}


def _make_worker(env, require_review=False, require_tests=False) -> IntegrationWorker:
    return IntegrationWorker(
        workspace_id=env["ws_id"],
        project_id=env["proj_id"],
        project_root=str(env["tmp_path"]),
        actor_id="iw_agent",
        actor_role="integration_worker",
        require_review=require_review,
        require_tests=require_tests,
    )


def test_empty_queue(env):
    worker = _make_worker(env)
    result = worker.process_next()
    assert result["status"] == "empty"


def test_enqueue_and_queue_status(env):
    worker = _make_worker(env)
    worker.enqueue("wt_001", branch_name="feat/auth")
    status = worker.queue_status()
    assert len(status) == 1
    assert status[0]["worktree_id"] == "wt_001"
    assert status[0]["status"] == "queued"


def test_review_gate_blocks_without_artifact(env):
    worker = _make_worker(env, require_review=True, require_tests=False)
    worker.enqueue("wt_002", branch_name="feat/login")
    result = worker.process_next()
    assert result["status"] == "gate_failed"
    assert "review" in result["message"].lower()


def test_test_gate_blocks_without_artifact(env):
    worker = _make_worker(env, require_review=False, require_tests=True)
    worker.enqueue("wt_003", branch_name="feat/api")
    result = worker.process_next()
    assert result["status"] == "gate_failed"
    assert "test" in result["message"].lower()


def test_skip_gates_allows_process(env):
    """With skip_gates=True, no artifact gates are checked."""
    # For non-git projects, merge degrades gracefully (no git commands)
    worker = _make_worker(env, require_review=True, require_tests=True)
    worker.enqueue("wt_004", branch_name="feat/skip")
    # Should not gate_fail when skip_gates=True
    # It will attempt a git merge (which will error on non-git path) — that's ok
    result = worker.process_next(skip_gates=True)
    # Acceptable outcomes: merged, error (no git repo), not gate_failed
    assert result.get("status") != "gate_failed"


def test_drain_empty(env):
    worker = _make_worker(env)
    results = worker.drain()
    assert len(results) == 1
    assert results[0]["status"] == "empty"


def test_drain_stops_on_gate_fail(env):
    worker = _make_worker(env, require_review=True)
    worker.enqueue("wt_005", branch_name="feat/a")
    worker.enqueue("wt_006", branch_name="feat/b")
    results = worker.drain()
    # First item hits gate_failed, drain stops
    statuses = [r["status"] for r in results]
    assert "gate_failed" in statuses
    # Should not have processed all items blindly
    assert len(results) <= 2


def test_non_integration_worker_cannot_merge(env):
    """Roles other than integration_worker must be blocked."""
    bad_worker = IntegrationWorker(
        workspace_id=env["ws_id"],
        project_id=env["proj_id"],
        project_root=str(env["tmp_path"]),
        actor_id="agent_cos",
        actor_role="chief_of_staff",  # NOT integration_worker
        require_review=False,
        require_tests=False,
    )
    bad_worker.enqueue("wt_007")

    with pytest.raises(PolicyDeniedError):
        bad_worker.process_next(skip_gates=True)
