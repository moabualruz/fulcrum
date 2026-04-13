"""Tests for MCP server task tools."""
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


def test_list_tasks_returns_list():
    with patch("pi_agent_os.mcp.server._get_task_reader") as m:
        reader = MagicMock()
        reader.list.return_value = [_make_mock_task()]
        m.return_value = reader
        from pi_agent_os.mcp.server import list_tasks
        result = list_tasks(project_id="proj-1", workspace_id="ws-1")
    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0]["task_id"] == "tsk-001"
    assert result[0]["title"] == "Test task"
    assert result[0]["status"] == "todo"


def test_create_task_returns_task_id():
    with patch("pi_agent_os.mcp.server._get_task_writer") as m:
        writer = MagicMock()
        m.return_value = writer
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
    assert writer.create.called


def test_update_task_calls_writer():
    with patch("pi_agent_os.mcp.server._get_task_writer") as mw, \
         patch("pi_agent_os.mcp.server._get_task_reader") as mr:
        writer = MagicMock()
        mw.return_value = writer
        reader = MagicMock()
        existing_task = _make_mock_task(task_id="tsk-001")
        existing_task.blockers = []
        reader.list.return_value = [existing_task]
        mr.return_value = reader
        from pi_agent_os.mcp.server import update_task
        result = update_task(task_id="tsk-001", status="in_progress", note="Starting work")
    writer.update.assert_called_once_with(
        "tsk-001", {"status": "in_progress", "blockers": ["Starting work"]}
    )
    assert result["updated"] is True


def test_update_task_no_op_returns_not_updated():
    with patch("pi_agent_os.mcp.server._get_task_writer") as mw:
        writer = MagicMock()
        mw.return_value = writer
        from pi_agent_os.mcp.server import update_task
        result = update_task(task_id="tsk-001")
    writer.update.assert_not_called()
    assert result["updated"] is False
    assert result["changes"] == []


def test_recall_memory_returns_list():
    with patch("pi_agent_os.mcp.server._get_memory_facade") as m:
        facade = MagicMock()
        facade.recall.return_value = [
            {"summary": "We use SQLite for the control plane", "score": 0.9, "tags": ["decision"]}
        ]
        m.return_value = facade
        from pi_agent_os.mcp.server import recall_memory
        result = recall_memory(query="database choice", workspace_id="ws-1", project_id="proj-1")
    assert isinstance(result, list)
    assert result[0]["content"] == "We use SQLite for the control plane"
    facade.recall.assert_called_once_with(
        "database choice", workspace_id="ws-1", project_id="proj-1", limit=10
    )


def test_write_memory_returns_saved():
    with patch("pi_agent_os.mcp.server._get_memory_facade") as m:
        facade = MagicMock()
        facade.write.return_value = "mem-001"
        m.return_value = facade
        from pi_agent_os.mcp.server import write_memory
        result = write_memory(
            content="Decision: use SQLite not Postgres",
            workspace_id="ws-1",
            project_id="proj-1",
            tags="decision,architecture",
        )
    assert result["saved"] is True
    assert result["tags"] == ["decision", "architecture"]
    facade.write.assert_called_once()


def test_list_agent_profiles_returns_list():
    with patch("pi_agent_os.mcp.server._get_pi_runtime") as m:
        rt = MagicMock()
        rt.list_profiles.return_value = [{"profile_id": "chief_of_staff"}]
        m.return_value = rt
        from pi_agent_os.mcp.server import list_agent_profiles
        result = list_agent_profiles()
    assert result[0]["profile_id"] == "chief_of_staff"


def test_get_agent_run_status_returns_dict():
    with patch("pi_agent_os.mcp.server._get_pi_runtime") as m:
        rt = MagicMock()
        rt.get_run_status.return_value = {"run_id": "run-001", "status": "running"}
        m.return_value = rt
        from pi_agent_os.mcp.server import get_agent_run_status
        result = get_agent_run_status(run_id="run-001")
    assert result["status"] == "running"
