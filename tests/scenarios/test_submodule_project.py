"""
Golden scenario: submodule-aware project flow.

Spec §5.4 (project_type=submodule), §18.7 (worktree isolation per submodule).

Verifies:
- submodule project can be registered with project_type=submodule
- parent_project_id is set correctly
- worktree allocation raises ValueError on non-git path (same as non_git)
- issue/task lifecycle works normally
- board_items projection reflects submodule project correctly
"""
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
from pi_agent_os.adapters.writers.project_writer import ProjectWriter, ProjectReadAdapter
from pi_agent_os.adapters.readers.issue_read import IssueWriter
from pi_agent_os.adapters.readers.task_read import TaskWriter, TaskReadAdapter
from pi_agent_os.adapters.readers.board_read import BoardReadAdapter
from pi_agent_os.worktrees.allocator import WorktreeAllocator


@pytest.fixture
def env(tmp_path):
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    return tmp_path


@pytest.fixture
def setup(env, tmp_path):
    ws_id = generate_id(WS_PREFIX)
    parent_id = generate_id(PROJ_PREFIX)
    sub_id = generate_id(PROJ_PREFIX)

    ws = Workspace(workspace_id=ws_id, name="Submodule WS")
    WorkspaceWriter().create(ws)

    parent_root = tmp_path / "monorepo"
    parent_root.mkdir()
    sub_root = parent_root / "services" / "auth"
    sub_root.mkdir(parents=True)

    parent = Project(
        project_id=parent_id,
        workspace_id=ws_id,
        name="Monorepo Root",
        project_type="git",
        root_path=str(parent_root),
        default_branch="main",
    )
    ProjectWriter().create(parent)

    submodule = Project(
        project_id=sub_id,
        workspace_id=ws_id,
        name="Auth Service",
        project_type="submodule",
        root_path=str(sub_root),
        default_branch="main",
        parent_project_id=parent_id,
    )
    ProjectWriter().create(submodule)

    return {
        "ws_id": ws_id,
        "parent_id": parent_id,
        "sub_id": sub_id,
        "parent_root": parent_root,
        "sub_root": sub_root,
        "tmp_path": tmp_path,
    }


# ── Project registration ────────────────────────────────────────────────────

def test_submodule_project_type_stored(env, setup):
    row = db.fetchone("SELECT * FROM projects WHERE id=?", (setup["sub_id"],))
    assert row is not None
    assert row["project_type"] == "submodule"


def test_submodule_parent_link_stored(env, setup):
    row = db.fetchone("SELECT * FROM projects WHERE id=?", (setup["sub_id"],))
    assert row["parent_project_id"] == setup["parent_id"]


def test_parent_project_has_no_parent(env, setup):
    row = db.fetchone("SELECT * FROM projects WHERE id=?", (setup["parent_id"],))
    assert row["parent_project_id"] is None


def test_submodule_readable_via_adapter(env, setup):
    proj = ProjectReadAdapter().get(setup["sub_id"])
    assert proj is not None
    assert proj.project_type == "submodule"
    assert proj.parent_project_id == setup["parent_id"]


def test_workspace_lists_both_projects(env, setup):
    projects = ProjectReadAdapter().for_workspace(setup["ws_id"])
    ids = {p.project_id for p in projects}
    assert setup["parent_id"] in ids
    assert setup["sub_id"] in ids


# ── Worktree isolation ──────────────────────────────────────────────────────

def test_worktree_on_non_git_submodule_path_raises(env, setup):
    """Submodule path that is not a real git repo raises ValueError."""
    allocator = WorktreeAllocator()
    with pytest.raises(ValueError, match="Not a git repository"):
        allocator.allocate(
            project_root=str(setup["sub_root"]),
            branch_name="feat/auth-fix",
            workspace_id=setup["ws_id"],
            project_id=setup["sub_id"],
        )


# ── Issue/task lifecycle on submodule project ───────────────────────────────

def test_issue_created_on_submodule_project(env, setup):
    iss_id = generate_id(ISS_PREFIX)
    issue = Issue(
        issue_id=iss_id,
        workspace_id=setup["ws_id"],
        project_id=setup["sub_id"],
        display_id=f"ISS-{iss_id[-6:]}",
        title="Auth submodule issue",
        description="Fix JWT validation",
        status=IssueStatus.backlog,
    )
    IssueWriter().create(issue)
    row = db.fetchone("SELECT * FROM issues WHERE id=?", (iss_id,))
    assert row is not None
    assert row["project_id"] == setup["sub_id"]


def test_task_lifecycle_on_submodule_project(env, setup):
    iss_id = generate_id(ISS_PREFIX)
    IssueWriter().create(Issue(
        issue_id=iss_id,
        workspace_id=setup["ws_id"],
        project_id=setup["sub_id"],
        display_id=f"ISS-SUB",
        title="Parent issue",
        description="",
        status=IssueStatus.in_progress,
    ))
    task_id = generate_id(TASK_PREFIX)
    TaskWriter().create(Task(
        task_id=task_id,
        workspace_id=setup["ws_id"],
        project_id=setup["sub_id"],
        issue_id=iss_id,
        display_id=f"TASK-SUB",
        title="Submodule task",
        description="",
        status=TaskStatus.queued,
    ))
    TaskWriter().update(task_id, {"status": TaskStatus.running})
    t = TaskReadAdapter().get(task_id)
    assert t is not None
    assert t.status == TaskStatus.running
    assert t.project_id == setup["sub_id"]


# ── Board projection reflects submodule project ─────────────────────────────

def test_board_items_for_submodule_project(env, setup):
    iss_id = generate_id(ISS_PREFIX)
    IssueWriter().create(Issue(
        issue_id=iss_id,
        workspace_id=setup["ws_id"],
        project_id=setup["sub_id"],
        display_id="ISS-BOARD",
        title="Board test issue",
        description="",
        status=IssueStatus.in_progress,
    ))
    board = BoardReadAdapter()
    items = board.for_project(setup["sub_id"])
    assert len(items) >= 1
    issue_items = [i for i in items if i["item_type"] == "issue"]
    assert any(i["title"] == "Board test issue" for i in issue_items)


def test_board_does_not_mix_parent_and_submodule(env, setup):
    """Board items for parent project should not include submodule issues."""
    # Create issue in submodule
    iss_sub = generate_id(ISS_PREFIX)
    IssueWriter().create(Issue(
        issue_id=iss_sub,
        workspace_id=setup["ws_id"],
        project_id=setup["sub_id"],
        display_id="ISS-SUB2",
        title="Sub issue",
        description="",
        status=IssueStatus.backlog,
    ))
    # Create issue in parent
    iss_parent = generate_id(ISS_PREFIX)
    IssueWriter().create(Issue(
        issue_id=iss_parent,
        workspace_id=setup["ws_id"],
        project_id=setup["parent_id"],
        display_id="ISS-PAR",
        title="Parent issue",
        description="",
        status=IssueStatus.backlog,
    ))
    board = BoardReadAdapter()
    sub_items = {i["id"] for i in board.for_project(setup["sub_id"])}
    parent_items = {i["id"] for i in board.for_project(setup["parent_id"])}
    # Items must not cross project boundaries
    assert iss_sub in sub_items
    assert iss_parent in parent_items
    assert iss_sub not in parent_items
    assert iss_parent not in sub_items
