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
