"""Golden scenario: single-agent implementation flow. Spec §17."""
from __future__ import annotations
import pytest

from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX, ISS_PREFIX, TASK_PREFIX, HOF_PREFIX
from pi_agent_os.db import connection as db
from pi_agent_os.models.workspace import Workspace
from pi_agent_os.models.project import Project
from pi_agent_os.models.issue import Issue, IssueStatus
from pi_agent_os.models.task import Task, TaskStatus
from pi_agent_os.models.handoff import HandoffPacket, HandoffMode
from pi_agent_os.models.agent_run import WorkerResult
from pi_agent_os.adapters.writers.workspace_writer import WorkspaceWriter
from pi_agent_os.adapters.writers.project_writer import ProjectWriter
from pi_agent_os.adapters.readers.issue_read import IssueWriter
from pi_agent_os.adapters.readers.task_read import TaskReadAdapter, TaskWriter
from pi_agent_os.worker.lifecycle import WorkerLifecycle


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
        name="Single Agent Test Workspace",
        description="",
        config_path="",
        status="active",
    )
    WorkspaceWriter().create(ws)
    return ws


@pytest.fixture
def project(env, ws_id, proj_id):
    proj = Project(
        project_id=proj_id,
        workspace_id=ws_id,
        name="Single Agent Test Project",
        project_type="non_git",
        root_path="/tmp/sa-test",
        write_mode="sequential",
    )
    ProjectWriter().create(proj)
    return proj


@pytest.fixture
def issue(env, ws_id, proj_id):
    iss_id = generate_id(ISS_PREFIX)
    issue = Issue(
        issue_id=iss_id,
        workspace_id=ws_id,
        project_id=proj_id,
        display_id=f"ISS-{iss_id[-6:]}",
        title="Implement feature X",
        description="Add feature X to the system",
        status=IssueStatus.in_progress,
    )
    IssueWriter().create(issue)
    return issue


@pytest.fixture
def task(env, ws_id, proj_id, issue):
    task_id = generate_id(TASK_PREFIX)
    t = Task(
        task_id=task_id,
        workspace_id=ws_id,
        project_id=proj_id,
        issue_id=issue.issue_id,
        display_id=f"TASK-{task_id[-6:]}",
        title="Implement feature X backend",
        description="Write the backend code for feature X",
        status=TaskStatus.queued,
    )
    TaskWriter().create(t)
    return t


def _make_handoff(from_agent: str, task_id: str, ws_id: str = "ws_test", proj_id: str = "proj_test") -> HandoffPacket:
    return HandoffPacket(
        handoff_id=generate_id(HOF_PREFIX),
        from_agent_id=from_agent,
        to_agent_id="implementer_backend",
        goal="Implement feature X",
        task_type="implementation",
        task_id=task_id,
        workspace_id=ws_id,
        project_id=proj_id,
        priority="medium",
        scope="task",
        handoff_mode=HandoffMode.artifact_first_brief,
        inputs={"context": "feature X implementation"},
        done_criteria=["Feature X backend complete"],
    )


def test_worker_lifecycle_start_complete(env, workspace, project, issue, task, ws_id, proj_id):
    """Start and complete a worker run — task should transition to completed."""
    lifecycle = WorkerLifecycle()
    handoff = _make_handoff(from_agent="chief_of_staff_1", task_id=task.task_id, ws_id=ws_id, proj_id=proj_id)

    run = lifecycle.start(
        handoff=handoff,
        agent_role="implementer_backend",
        workspace_id=ws_id,
        project_id=proj_id,
    )

    assert run.run_id.startswith("run_")
    assert run.workspace_id == ws_id

    # Complete the run
    result = WorkerResult(
        run_id=run.run_id,
        task_id=task.task_id,
        status="completed",
        summary="Feature X implemented",
    )
    lifecycle.complete(run.run_id, result)

    # Task should now be completed
    updated_task = TaskReadAdapter().get(task.task_id)
    assert updated_task is not None
    assert updated_task.status == TaskStatus.completed


def test_agent_status_readable_without_llm(env, workspace, project, issue, task, ws_id, proj_id):
    """AgentStatusReadAdapter can observe agent runs without LLM involvement."""
    from pi_agent_os.adapters.readers.agent_status_read import AgentStatusReadAdapter

    lifecycle = WorkerLifecycle()
    handoff = _make_handoff(from_agent="chief_of_staff_2", task_id=task.task_id, ws_id=ws_id, proj_id=proj_id)

    run = lifecycle.start(
        handoff=handoff,
        agent_role="implementer_backend",
        workspace_id=ws_id,
        project_id=proj_id,
    )

    adapter = AgentStatusReadAdapter()
    run_obj = adapter.get(run.run_id)

    assert run_obj is not None
    assert run_obj.run_id == run.run_id


def test_worker_heartbeat_updates_status(env, workspace, project, issue, task, ws_id, proj_id):
    """Heartbeat updates the run's current step and progress without LLM."""
    lifecycle = WorkerLifecycle()
    handoff = _make_handoff(from_agent="chief_of_staff_3", task_id=task.task_id, ws_id=ws_id, proj_id=proj_id)

    run = lifecycle.start(
        handoff=handoff,
        agent_role="implementer_backend",
        workspace_id=ws_id,
        project_id=proj_id,
    )

    lifecycle.heartbeat(
        run_id=run.run_id,
        current_step="writing_code",
        progress_pct=50.0,
    )

    row = db.fetchone("SELECT * FROM agent_runs WHERE id=?", (run.run_id,))
    assert row is not None
    assert row["current_step"] == "writing_code"


def test_worker_block_then_complete(env, workspace, project, issue, task, ws_id, proj_id):
    """A worker can be blocked and then subsequently completed."""
    lifecycle = WorkerLifecycle()
    handoff = _make_handoff(from_agent="chief_of_staff_4", task_id=task.task_id, ws_id=ws_id, proj_id=proj_id)

    run = lifecycle.start(
        handoff=handoff,
        agent_role="implementer_backend",
        workspace_id=ws_id,
        project_id=proj_id,
    )

    lifecycle.block(run.run_id, blocker_reason="Waiting for design approval")

    blocked_row = db.fetchone("SELECT status, blocker FROM agent_runs WHERE id=?", (run.run_id,))
    assert blocked_row["status"] == "blocked"
    assert "design approval" in blocked_row["blocker"]

    # Now complete it
    result = WorkerResult(
        run_id=run.run_id,
        task_id=task.task_id,
        status="completed",
        summary="Unblocked and completed",
    )
    lifecycle.complete(run.run_id, result)

    final_row = db.fetchone("SELECT status FROM agent_runs WHERE id=?", (run.run_id,))
    assert final_row["status"] == "finished"
