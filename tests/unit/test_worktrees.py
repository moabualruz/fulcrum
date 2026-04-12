"""Tests for worktree allocator and merge queue."""
from __future__ import annotations
import subprocess
import pytest
from unittest.mock import patch, MagicMock

from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX, TASK_PREFIX, WT_PREFIX
from pi_agent_os.db import connection as db
from pi_agent_os.models.workspace import Workspace
from pi_agent_os.models.project import Project
from pi_agent_os.adapters.writers.workspace_writer import WorkspaceWriter
from pi_agent_os.adapters.writers.project_writer import ProjectWriter
from pi_agent_os.worktrees.allocator import WorktreeAllocator
from pi_agent_os.worktrees.merge_queue import MergeQueue
from pi_agent_os.policy.engine import PolicyDeniedError


@pytest.fixture
def env(tmp_path):
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    return tmp_path


@pytest.fixture
def git_repo(tmp_path):
    """Create a minimal real git repo for worktree tests."""
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)
    subprocess.run(
        ["git", "-C", str(repo), "config", "user.email", "test@test.com"],
        check=True, capture_output=True,
    )
    subprocess.run(
        ["git", "-C", str(repo), "config", "user.name", "Test User"],
        check=True, capture_output=True,
    )
    subprocess.run(
        ["git", "-C", str(repo), "commit", "--allow-empty", "-m", "init"],
        check=True, capture_output=True,
    )
    return repo


@pytest.fixture
def ws_id():
    return generate_id(WS_PREFIX)


@pytest.fixture
def proj_id():
    return generate_id(PROJ_PREFIX)


@pytest.fixture
def workspace(env, ws_id):
    ws = Workspace(
        workspace_id=ws_id,
        name="Worktree Test Workspace",
        description="",
        config_path="",
        status="active",
    )
    WorkspaceWriter().create(ws)
    return ws


@pytest.fixture
def project(env, workspace, ws_id, proj_id, git_repo):
    proj = Project(
        project_id=proj_id,
        workspace_id=ws_id,
        name="Worktree Test Project",
        project_type="git",
        root_path=str(git_repo),
        write_mode="worktree",
    )
    ProjectWriter().create(proj)
    return proj


# ── WorktreeAllocator tests ──────────────────────────────────────────────────

def test_worktree_allocate_creates_db_record(env, project, git_repo, ws_id, proj_id):
    """Allocating a worktree should persist a row in the worktrees table."""
    allocator = WorktreeAllocator()
    wt = allocator.allocate(
        project_root=str(git_repo),
        branch_name="feature-test",
        workspace_id=ws_id,
        project_id=proj_id,
    )

    assert wt.worktree_id.startswith("wt_")
    row = db.fetchone("SELECT * FROM worktrees WHERE id=?", (wt.worktree_id,))
    assert row is not None
    assert row["workspace_id"] == ws_id
    assert row["project_id"] == proj_id
    assert "pi/feature-test/" in row["branch_name"]

    # Cleanup
    try:
        allocator.cleanup(wt.worktree_id, str(git_repo), force=True)
    except Exception:
        pass


def test_worktree_allocate_emits_event(env, project, git_repo, ws_id, proj_id):
    """Allocating a worktree should emit a worktree_allocated event."""
    from pi_agent_os.events.store import tail

    allocator = WorktreeAllocator()
    wt = allocator.allocate(
        project_root=str(git_repo),
        branch_name="feature-events",
        workspace_id=ws_id,
        project_id=proj_id,
    )

    events = tail(workspace_id=ws_id, limit=20)
    assert any(e["evt_type"] == "worktree_allocated" for e in events)

    # Cleanup
    try:
        allocator.cleanup(wt.worktree_id, str(git_repo), force=True)
    except Exception:
        pass


def test_worktree_allocate_non_git_raises(env, tmp_path, ws_id, proj_id):
    """Allocating a worktree for a non-git directory should raise ValueError."""
    non_git = tmp_path / "not-a-repo"
    non_git.mkdir()
    allocator = WorktreeAllocator()

    with pytest.raises(ValueError, match="Not a git repository"):
        allocator.allocate(
            project_root=str(non_git),
            branch_name="feature-fail",
            workspace_id=ws_id,
            project_id=proj_id,
        )


# ── MergeQueue tests ─────────────────────────────────────────────────────────

def test_merge_queue_task_queued(env, ws_id, proj_id):
    """Enqueueing a task should create a DB record in merge_queue_projection."""
    queue = MergeQueue()
    wt_id = generate_id(WT_PREFIX)
    task_id = generate_id(TASK_PREFIX)

    queue.enqueue(
        worktree_id=wt_id,
        workspace_id=ws_id,
        project_id=proj_id,
        task_id=task_id,
        branch_name="pi/feature/test001",
    )

    row = db.fetchone(
        "SELECT * FROM merge_queue_projection WHERE worktree_id=?", (wt_id,)
    )
    assert row is not None
    assert row["status"] == "queued"
    assert row["workspace_id"] == ws_id
    assert row["task_id"] == task_id


def test_merge_queue_non_integration_worker_blocked(env, ws_id, proj_id):
    """Only integration_worker role may execute merges (spec §21.10)."""
    queue = MergeQueue()
    wt_id = generate_id(WT_PREFIX)

    # First enqueue something
    queue.enqueue(
        worktree_id=wt_id,
        workspace_id=ws_id,
        project_id=proj_id,
        branch_name="pi/test/branch",
    )

    with pytest.raises(PolicyDeniedError):
        queue.merge(
            worktree_id=wt_id,
            project_root="/tmp/fake",
            actor_id="some_agent",
            actor_role="implementer_backend",  # not integration_worker
            workspace_id=ws_id,
        )


def test_sequential_non_git_write_enforced(env, tmp_path, ws_id, proj_id):
    """Non-git project uses sequential writes — worktree allocation should fail."""
    non_git = tmp_path / "my-non-git-project"
    non_git.mkdir()

    allocator = WorktreeAllocator()

    # Attempting to allocate a worktree for a non-git directory should fail
    with pytest.raises(ValueError):
        allocator.allocate(
            project_root=str(non_git),
            branch_name="sequential-write",
            workspace_id=ws_id,
            project_id=proj_id,
        )


def test_merge_queue_enqueue_emits_event(env, ws_id, proj_id):
    """Enqueueing a task should emit merge_queued event."""
    from pi_agent_os.events.store import tail

    queue = MergeQueue()
    wt_id = generate_id(WT_PREFIX)

    queue.enqueue(
        worktree_id=wt_id,
        workspace_id=ws_id,
        project_id=proj_id,
        branch_name="pi/test/emit",
    )

    events = tail(workspace_id=ws_id, limit=10)
    assert any(e["evt_type"] == "merge_queued" for e in events)


def test_merge_queue_integration_worker_attempts_merge(env, ws_id, proj_id):
    """integration_worker role can call merge — subprocess failure returns dict."""
    queue = MergeQueue()
    wt_id = generate_id(WT_PREFIX)

    queue.enqueue(
        worktree_id=wt_id,
        workspace_id=ws_id,
        project_id=proj_id,
        branch_name="pi/test/merge",
    )

    # Worktree row doesn't exist yet in the worktrees table — should return error dict
    result = queue.merge(
        worktree_id=wt_id,
        project_root="/tmp/nonexistent",
        actor_id="integration_worker_1",
        actor_role="integration_worker",
        workspace_id=ws_id,
    )
    # Returns a dict (not raises) since worktree row missing
    assert isinstance(result, dict)
    assert result.get("success") is False
