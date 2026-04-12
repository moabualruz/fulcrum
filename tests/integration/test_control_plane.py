"""Integration tests for the Phase 1 control plane."""
import pytest
import tempfile
from pathlib import Path
from datetime import datetime, timezone
from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX, ISS_PREFIX, TASK_PREFIX, RUN_PREFIX
from pi_agent_os.models.workspace import Workspace
from pi_agent_os.models.project import Project
from pi_agent_os.models.issue import Issue, IssueStatus
from pi_agent_os.models.task import Task, TaskStatus
from pi_agent_os.models.agent_run import AgentRun, AgentRunStatus
from pi_agent_os.adapters.writers.workspace_writer import WorkspaceWriter
from pi_agent_os.adapters.writers.project_writer import ProjectWriter, ProjectReadAdapter
from pi_agent_os.adapters.readers.issue_read import IssueWriter, IssueReadAdapter
from pi_agent_os.adapters.readers.task_read import TaskWriter, TaskReadAdapter
from pi_agent_os.adapters.writers.agent_run_writer import AgentRunWriter
from pi_agent_os.adapters.readers.agent_status_read import AgentStatusReadAdapter
from pi_agent_os.adapters.readers.board_read import BoardReadAdapter
from pi_agent_os.events.store import tail as events_tail
from pi_agent_os.db import connection as db


@pytest.fixture
def env(tmp_path):
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    yield tmp_path


@pytest.fixture
def workspace(env):
    ws = Workspace(workspace_id=generate_id(WS_PREFIX), name="Test Workspace")
    WorkspaceWriter().create(ws)
    return ws


@pytest.fixture
def project(workspace):
    proj = Project(
        project_id=generate_id(PROJ_PREFIX),
        workspace_id=workspace.workspace_id,
        name="Test Project",
        project_type="git",
        root_path="/tmp/test-repo",
    )
    ProjectWriter().create(proj)
    return proj


def test_workspace_create_and_read(env):
    ws = Workspace(workspace_id=generate_id(WS_PREFIX), name="My Workspace")
    WorkspaceWriter().create(ws)

    from pi_agent_os.adapters.readers.workspace_read import WorkspaceReadAdapter
    retrieved = WorkspaceReadAdapter().get(ws.workspace_id)
    assert retrieved is not None
    assert retrieved.name == "My Workspace"


def test_project_create_and_read(workspace):
    proj = Project(
        project_id=generate_id(PROJ_PREFIX),
        workspace_id=workspace.workspace_id,
        name="My Project",
        project_type="git",
        root_path="/home/user/myproject",
    )
    ProjectWriter().create(proj)

    retrieved = ProjectReadAdapter().get(proj.project_id)
    assert retrieved is not None
    assert retrieved.name == "My Project"


def test_issue_create_updates_board(project, workspace):
    issue = Issue(
        issue_id=generate_id(ISS_PREFIX),
        workspace_id=workspace.workspace_id,
        project_id=project.project_id,
        display_id="ISS-1",
        title="Implement login feature",
        status=IssueStatus.backlog,
        priority="high",
    )
    IssueWriter().create(issue)

    # Board projection should be updated
    board = BoardReadAdapter()
    items = board.for_project(project.project_id)
    assert any(i["display_id"] == "ISS-1" for i in items)


def test_issue_status_update_reflects_on_board(project, workspace):
    issue = Issue(
        issue_id=generate_id(ISS_PREFIX),
        workspace_id=workspace.workspace_id,
        project_id=project.project_id,
        display_id="ISS-2",
        title="Fix bug",
        status=IssueStatus.backlog,
    )
    IssueWriter().create(issue)
    IssueWriter().update(issue.issue_id, {"status": "in_progress"})

    board_item = BoardReadAdapter().get(issue.issue_id)
    assert board_item is not None
    assert board_item["status"] == "in_progress"


def test_task_lifecycle(project, workspace):
    task = Task(
        task_id=generate_id(TASK_PREFIX),
        workspace_id=workspace.workspace_id,
        project_id=project.project_id,
        display_id="TASK-1",
        title="Write unit tests",
        status=TaskStatus.queued,
    )
    TaskWriter().create(task)

    # Claim task
    TaskWriter().update(task.task_id, {"status": "claimed"})
    updated = TaskReadAdapter().get(task.task_id)
    assert updated is not None
    assert updated.status == TaskStatus.claimed

    # Complete task
    TaskWriter().update(task.task_id, {"status": "completed"})
    completed = TaskReadAdapter().get(task.task_id)
    assert completed.status == TaskStatus.completed


def test_agent_run_lifecycle(project, workspace):
    run = AgentRun(
        run_id=generate_id(RUN_PREFIX),
        workspace_id=workspace.workspace_id,
        project_id=project.project_id,
        display_id="RUN-1",
        agent_id="agent_backend_1",
        agent_role="implementer_backend",
        status=AgentRunStatus.created,
    )
    AgentRunWriter().create(run)

    # Heartbeat
    writer = AgentRunWriter()
    writer.heartbeat(run.run_id, current_step="writing code", progress_pct=25.0)

    # Check live status
    status_adapter = AgentStatusReadAdapter()
    live = status_adapter.get(run.run_id)
    assert live is not None
    assert live.current_step == "writing code"
    assert live.progress_pct == 25.0

    # Mark as running then finished
    writer.update(run.run_id, {"status": "running"})
    writer.update(run.run_id, {"status": "finished"})

    finished = status_adapter.get(run.run_id)
    assert finished.status == AgentRunStatus.finished


def test_events_emitted_on_lifecycle(project, workspace):
    issue = Issue(
        issue_id=generate_id(ISS_PREFIX),
        workspace_id=workspace.workspace_id,
        project_id=project.project_id,
        display_id="ISS-EVT",
        title="Event test issue",
        status=IssueStatus.backlog,
    )
    IssueWriter().create(issue)

    events = events_tail(workspace_id=workspace.workspace_id, limit=10)
    event_types = [e["evt_type"] for e in events]
    assert "issue_created" in event_types


def test_board_shows_blocked_items(project, workspace):
    issue = Issue(
        issue_id=generate_id(ISS_PREFIX),
        workspace_id=workspace.workspace_id,
        project_id=project.project_id,
        display_id="ISS-BLK",
        title="Blocked issue",
        status=IssueStatus.blocked,
    )
    IssueWriter().create(issue)

    blocked = BoardReadAdapter().blocked_items(workspace.workspace_id)
    assert any(i["display_id"] == "ISS-BLK" for i in blocked)


def test_agent_status_queryable_without_llm(project, workspace):
    """Spec §19.8: every agent/run must be queryable without LLM."""
    run = AgentRun(
        run_id=generate_id(RUN_PREFIX),
        workspace_id=workspace.workspace_id,
        project_id=project.project_id,
        display_id="RUN-STATUS",
        agent_id="agent_test",
        agent_role="researcher",
        status=AgentRunStatus.running,
        current_step="searching documentation",
        current_path="/src/auth.py",
        progress_pct=60.0,
    )
    AgentRunWriter().create(run)

    adapter = AgentStatusReadAdapter()
    live = adapter.get(run.run_id)

    # All queryable fields available without LLM
    assert live.status == AgentRunStatus.running
    assert live.current_step == "searching documentation"
    assert live.current_path == "/src/auth.py"
    assert live.progress_pct == 60.0
    assert live.agent_role == "researcher"


def test_fts_search_issues(project, workspace):
    issue = Issue(
        issue_id=generate_id(ISS_PREFIX),
        workspace_id=workspace.workspace_id,
        project_id=project.project_id,
        display_id="ISS-FTS",
        title="Implement authentication middleware",
        description="Add JWT authentication",
        status=IssueStatus.ready,
    )
    IssueWriter().create(issue)

    results = IssueReadAdapter().search("authentication")
    assert len(results) >= 1
    assert any(r.issue_id == issue.issue_id for r in results)
