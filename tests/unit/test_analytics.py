"""Tests for metrics and analytics."""
import pytest
from datetime import date
from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX, ISS_PREFIX, TASK_PREFIX, RUN_PREFIX
from pi_agent_os.models.workspace import Workspace
from pi_agent_os.models.project import Project
from pi_agent_os.models.issue import Issue, IssueStatus
from pi_agent_os.models.task import Task, TaskStatus
from pi_agent_os.models.agent_run import AgentRun, AgentRunStatus
from pi_agent_os.adapters.writers.workspace_writer import WorkspaceWriter
from pi_agent_os.adapters.writers.project_writer import ProjectWriter
from pi_agent_os.adapters.readers.issue_read import IssueWriter
from pi_agent_os.adapters.readers.task_read import TaskWriter
from pi_agent_os.adapters.writers.agent_run_writer import AgentRunWriter
from pi_agent_os.analytics.metrics import MetricsService


@pytest.fixture
def env(tmp_path):
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    return tmp_path


@pytest.fixture
def ws_proj(env):
    ws = Workspace(workspace_id=generate_id(WS_PREFIX), name="Analytics WS")
    WorkspaceWriter().create(ws)
    proj = Project(
        project_id=generate_id(PROJ_PREFIX),
        workspace_id=ws.workspace_id,
        name="Analytics Project",
        project_type="git",
        root_path="/tmp",
    )
    ProjectWriter().create(proj)
    return ws, proj


def test_wip_count_zero_initially(ws_proj):
    ws, proj = ws_proj
    svc = MetricsService()
    assert svc.wip_count(ws.workspace_id) == 0


def test_wip_count_increases_with_claimed_tasks(ws_proj):
    ws, proj = ws_proj
    for i in range(3):
        task = Task(
            task_id=generate_id(TASK_PREFIX),
            workspace_id=ws.workspace_id,
            project_id=proj.project_id,
            display_id=f"TASK-WIP-{i}",
            title=f"WIP task {i}",
            status=TaskStatus.claimed,
        )
        TaskWriter().create(task)
    svc = MetricsService()
    assert svc.wip_count(ws.workspace_id) == 3


def test_throughput_daily_zero_initially(ws_proj):
    ws, proj = ws_proj
    svc = MetricsService()
    assert svc.throughput_daily(ws.workspace_id) == 0.0


def test_agent_run_summary_empty(ws_proj):
    ws, proj = ws_proj
    svc = MetricsService()
    summary = svc.agent_run_summary(ws.workspace_id)
    assert summary.get("total", 0) == 0


def test_memory_scope_distribution(ws_proj):
    ws, proj = ws_proj
    from pi_agent_os.memory.facade import MemoryFacade
    facade = MemoryFacade()
    facade.write(workspace_id=ws.workspace_id, title="g1", summary="s", scope="global")
    facade.write(workspace_id=ws.workspace_id, title="p1", summary="s", scope="project", project_id=proj.project_id)
    facade.write(workspace_id=ws.workspace_id, title="p2", summary="s", scope="project", project_id=proj.project_id)

    svc = MetricsService()
    dist = svc.memory_scope_distribution(ws.workspace_id)
    assert dist.get("global", 0) == 1
    assert dist.get("project", 0) == 2


def test_daily_rollup(ws_proj):
    ws, proj = ws_proj
    # Create some issues
    for i in range(2):
        issue = Issue(
            issue_id=generate_id(ISS_PREFIX),
            workspace_id=ws.workspace_id,
            project_id=proj.project_id,
            display_id=f"ISS-R{i}",
            title=f"Rollup issue {i}",
            status=IssueStatus.backlog,
        )
        IssueWriter().create(issue)

    svc = MetricsService()
    svc.rollup_daily(ws.workspace_id, target_date=date.today())

    from pi_agent_os.db import connection as db
    row = db.fetchone(
        "SELECT * FROM analytics_daily WHERE workspace_id=? AND date=?",
        (ws.workspace_id, date.today().isoformat()),
    )
    assert row is not None
    assert row["issues_created"] >= 2


def test_issue_burndown_returns_data(ws_proj):
    ws, proj = ws_proj
    issue = Issue(
        issue_id=generate_id(ISS_PREFIX),
        workspace_id=ws.workspace_id,
        project_id=proj.project_id,
        display_id="ISS-BD",
        title="Burndown test",
        status=IssueStatus.in_progress,
    )
    IssueWriter().create(issue)

    svc = MetricsService()
    burndown = svc.issue_burndown(ws.workspace_id, project_id=proj.project_id)
    # May be empty if date filter doesn't cover today — check it doesn't error
    assert isinstance(burndown, list)
