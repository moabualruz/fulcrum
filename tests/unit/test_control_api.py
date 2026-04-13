"""Tests for the monitor control API (write endpoints)."""
import pytest
from fastapi.testclient import TestClient

from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX, TASK_PREFIX
from pi_agent_os.models.workspace import Workspace
from pi_agent_os.models.project import Project
from pi_agent_os.models.task import Task, TaskStatus
from pi_agent_os.adapters.writers.workspace_writer import WorkspaceWriter
from pi_agent_os.adapters.writers.project_writer import ProjectWriter
from pi_agent_os.adapters.readers.task_read import TaskWriter


@pytest.fixture
def env(tmp_path):
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    return tmp_path


@pytest.fixture
def ws(env):
    ws = Workspace(workspace_id=generate_id(WS_PREFIX), name="Control API Test WS")
    WorkspaceWriter().create(ws)
    return ws


@pytest.fixture
def proj(env, ws):
    p = Project(
        project_id=generate_id(PROJ_PREFIX),
        workspace_id=ws.workspace_id,
        name="Control API Test Proj",
        project_type="non_git",
        root_path="/tmp/ctrl-test",
        write_mode="sequential",
    )
    ProjectWriter().create(p)
    return p


@pytest.fixture
def task(env, ws, proj):
    t = Task(
        task_id=generate_id(TASK_PREFIX),
        workspace_id=ws.workspace_id,
        project_id=proj.project_id,
        display_id="T-CTRL-001",
        title="Control API test task",
        status=TaskStatus.queued,
    )
    TaskWriter().create(t)
    return t


@pytest.fixture
def client(env):
    from pi_agent_os.monitor.server import app
    return TestClient(app)


def test_list_workspaces(client, ws):
    r = client.get("/api/v1/control/workspaces")
    assert r.status_code == 200
    ids = [w["workspace_id"] for w in r.json()["workspaces"]]
    assert ws.workspace_id in ids


def test_list_projects(client, proj):
    r = client.get(f"/api/v1/control/projects?workspace_id={proj.workspace_id}")
    assert r.status_code == 200
    ids = [p["project_id"] for p in r.json()["projects"]]
    assert proj.project_id in ids


def test_list_tasks(client, task):
    r = client.get(f"/api/v1/control/tasks?workspace_id={task.workspace_id}")
    assert r.status_code == 200
    assert len(r.json()["tasks"]) >= 1


def test_create_task_via_api(client, ws, proj):
    r = client.post("/api/v1/control/tasks", json={
        "title": "API-created task",
        "workspace_id": ws.workspace_id,
        "project_id": proj.project_id,
        "priority": "high",
    })
    assert r.status_code == 200
    body = r.json()
    assert "task_id" in body
    assert body["title"] == "API-created task"


def test_update_task_via_api(client, task):
    r = client.patch(f"/api/v1/control/tasks/{task.task_id}", json={
        "status": "running",
        "note": "Starting work",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["updated"] is True


def test_start_run_via_api(client, ws, proj, task):
    r = client.post("/api/v1/control/runs", json={
        "task_id": task.task_id,
        "agent_role": "implementer",
        "workspace_id": ws.workspace_id,
        "project_id": proj.project_id,
    })
    assert r.status_code == 200
    body = r.json()
    assert "run_id" in body
    assert body["status"] == "running"


def test_heartbeat_via_api(client, ws, proj, task):
    # Start a run first
    start = client.post("/api/v1/control/runs", json={
        "task_id": task.task_id,
        "agent_role": "tester",
        "workspace_id": ws.workspace_id,
        "project_id": proj.project_id,
    })
    run_id = start.json()["run_id"]

    r = client.post(f"/api/v1/control/runs/{run_id}/heartbeat", json={
        "workspace_id": ws.workspace_id,
        "current_step": "running_tests",
        "progress_pct": 55.0,
    })
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_complete_run_via_api(client, ws, proj, task):
    start = client.post("/api/v1/control/runs", json={
        "task_id": task.task_id,
        "agent_role": "implementer",
        "workspace_id": ws.workspace_id,
        "project_id": proj.project_id,
    })
    run_id = start.json()["run_id"]

    r = client.post(f"/api/v1/control/runs/{run_id}/complete", json={
        "workspace_id": ws.workspace_id,
        "output_summary": "Done",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "completed"


def test_block_run_via_api(client, ws, proj, task):
    start = client.post("/api/v1/control/runs", json={
        "task_id": task.task_id,
        "agent_role": "reviewer",
        "workspace_id": ws.workspace_id,
        "project_id": proj.project_id,
    })
    run_id = start.json()["run_id"]

    r = client.post(f"/api/v1/control/runs/{run_id}/block", json={
        "workspace_id": ws.workspace_id,
        "reason": "Waiting for approval",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "blocked"


def test_policy_check_allows(client):
    r = client.post("/api/v1/control/policy/check", json={
        "action": "tool_use:read_file",
        "resource": "read_file",
        "workspace_id": "",
    })
    assert r.status_code == 200
    assert r.json()["allowed"] is True


def test_recall_memory_via_api(client, ws):
    r = client.post("/api/v1/control/memory/recall", json={
        "query": "database design",
        "workspace_id": ws.workspace_id,
        "limit": 5,
    })
    assert r.status_code == 200
    assert "memories" in r.json()


def test_write_memory_via_api(client, ws, proj):
    r = client.post("/api/v1/control/memory/write", json={
        "content": "We chose SQLite for the control plane",
        "workspace_id": ws.workspace_id,
        "project_id": proj.project_id,
        "title": "Architecture decision",
        "tags": "decision,architecture",
    })
    assert r.status_code == 200
    assert r.json()["saved"] is True
