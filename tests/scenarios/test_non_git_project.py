"""Golden scenario: non-git project flow. Spec §18.7."""
from __future__ import annotations
import pytest

from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX, ISS_PREFIX, TASK_PREFIX
from pi_agent_os.db import connection as db
from pi_agent_os.models.workspace import Workspace
from pi_agent_os.models.project import Project
from pi_agent_os.models.issue import Issue, IssueStatus
from pi_agent_os.models.task import Task, TaskStatus
from pi_agent_os.adapters.writers.workspace_writer import WorkspaceWriter
from pi_agent_os.adapters.writers.project_writer import ProjectWriter
from pi_agent_os.adapters.readers.issue_read import IssueWriter
from pi_agent_os.adapters.readers.task_read import TaskReadAdapter, TaskWriter
from pi_agent_os.worktrees.allocator import WorktreeAllocator


@pytest.fixture
def env(tmp_path):
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    return tmp_path


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
        name="Non-Git Test Workspace",
        description="",
        config_path="",
        status="active",
    )
    WorkspaceWriter().create(ws)
    return ws


@pytest.fixture
def non_git_project(env, tmp_path, ws_id, proj_id):
    """A project with project_type='non_git' and sequential write mode."""
    proj_root = tmp_path / "non-git-project"
    proj_root.mkdir()

    proj = Project(
        project_id=proj_id,
        workspace_id=ws_id,
        name="Non-Git Project",
        project_type="non_git",
        root_path=str(proj_root),
        write_mode="sequential",
    )
    ProjectWriter().create(proj)
    return proj


def test_non_git_project_created_with_sequential_write_mode(
    env, workspace, non_git_project
):
    """Non-git project should have write_mode=sequential."""
    row = db.fetchone("SELECT * FROM projects WHERE id=?", (non_git_project.project_id,))
    assert row is not None
    assert row["project_type"] == "non_git"
    assert row["write_mode"] == "sequential"


def test_non_git_project_no_worktree_allocation(
    env, workspace, non_git_project, ws_id, proj_id
):
    """Worktree allocation on a non-git project root raises ValueError (spec §18.7)."""
    allocator = WorktreeAllocator()

    with pytest.raises(ValueError, match="Not a git repository"):
        allocator.allocate(
            project_root=non_git_project.root_path,
            branch_name="some-feature",
            workspace_id=ws_id,
            project_id=proj_id,
        )


def test_non_git_issue_lifecycle(env, workspace, non_git_project, ws_id, proj_id):
    """Issue creation and status transitions work normally on non-git projects."""
    iss_id = generate_id(ISS_PREFIX)
    issue = Issue(
        issue_id=iss_id,
        workspace_id=ws_id,
        project_id=proj_id,
        display_id=f"ISS-{iss_id[-6:]}",
        title="Non-git issue",
        description="Should work fine",
        status=IssueStatus.backlog,
    )
    IssueWriter().create(issue)

    row = db.fetchone("SELECT * FROM issues WHERE id=?", (iss_id,))
    assert row is not None
    assert row["status"] == "backlog"


def test_non_git_task_lifecycle(env, workspace, non_git_project, ws_id, proj_id):
    """Task creation and completion work normally on non-git projects."""
    iss_id = generate_id(ISS_PREFIX)
    issue = Issue(
        issue_id=iss_id,
        workspace_id=ws_id,
        project_id=proj_id,
        display_id=f"ISS-{iss_id[-6:]}",
        title="Parent issue",
        description="",
        status=IssueStatus.in_progress,
    )
    IssueWriter().create(issue)

    task_id = generate_id(TASK_PREFIX)
    task = Task(
        task_id=task_id,
        workspace_id=ws_id,
        project_id=proj_id,
        issue_id=iss_id,
        display_id=f"TASK-{task_id[-6:]}",
        title="Non-git task",
        description="",
        status=TaskStatus.queued,
    )
    TaskWriter().create(task)

    # Transition task through statuses
    TaskWriter().update(task_id, {"status": TaskStatus.running})
    updated = TaskReadAdapter().get(task_id)
    assert updated is not None
    assert updated.status == TaskStatus.running

    TaskWriter().update(task_id, {"status": TaskStatus.completed})
    completed = TaskReadAdapter().get(task_id)
    assert completed is not None
    assert completed.status == TaskStatus.completed


def test_non_git_no_worktrees_in_db(env, workspace, non_git_project, ws_id, proj_id):
    """After working with a non-git project, no worktree rows should exist for it."""
    # Do normal issue/task work
    iss_id = generate_id(ISS_PREFIX)
    IssueWriter().create(Issue(
        issue_id=iss_id,
        workspace_id=ws_id,
        project_id=proj_id,
        display_id=f"ISS-{iss_id[-6:]}",
        title="Test issue",
        description="",
        status=IssueStatus.backlog,
    ))

    rows = db.fetchall("SELECT * FROM worktrees WHERE project_id=?", (proj_id,))
    assert len(rows) == 0
