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


# ---------------------------------------------------------------------------
# Lifecycle tools (Session 3+)
# ---------------------------------------------------------------------------

def test_start_agent_run_creates_record():
    mock_writer = MagicMock()
    with patch("pi_agent_os.adapters.writers.agent_run_writer.AgentRunWriter", mock_writer), \
         patch("pi_agent_os.events.store.emit"), \
         patch("pi_agent_os.models.events.EventType"):
        # Patch inline imports inside the function
        import pi_agent_os.adapters.writers.agent_run_writer as arw_mod
        import pi_agent_os.events.store as store_mod
        orig_writer = arw_mod.AgentRunWriter
        orig_emit = store_mod.emit
        arw_mod.AgentRunWriter = mock_writer
        store_mod.emit = MagicMock()
        try:
            from pi_agent_os.mcp.server import start_agent_run
            result = start_agent_run(
                task_id="tsk-001",
                agent_role="implementer",
                workspace_id="ws-1",
                project_id="proj-1",
            )
        finally:
            arw_mod.AgentRunWriter = orig_writer
            store_mod.emit = orig_emit
    assert "run_id" in result
    assert result["status"] == "running"


def test_start_agent_run_uses_provided_pi_run_id():
    import pi_agent_os.adapters.writers.agent_run_writer as arw_mod
    import pi_agent_os.events.store as store_mod
    mock_writer = MagicMock()
    orig_writer = arw_mod.AgentRunWriter
    orig_emit = store_mod.emit
    arw_mod.AgentRunWriter = mock_writer
    store_mod.emit = MagicMock()
    try:
        from pi_agent_os.mcp.server import start_agent_run
        result = start_agent_run(
            task_id="tsk-001",
            agent_role="tester",
            workspace_id="ws-1",
            pi_run_id="my-custom-run-id",
        )
    finally:
        arw_mod.AgentRunWriter = orig_writer
        store_mod.emit = orig_emit
    assert result["run_id"] == "my-custom-run-id"


def test_heartbeat_agent_run_ok():
    import pi_agent_os.adapters.writers.agent_run_writer as arw_mod
    mock_writer_cls = MagicMock()
    orig_writer = arw_mod.AgentRunWriter
    arw_mod.AgentRunWriter = mock_writer_cls
    try:
        from pi_agent_os.mcp.server import heartbeat_agent_run
        result = heartbeat_agent_run(
            run_id="run-001",
            workspace_id="ws-1",
            current_step="running tests",
            progress_pct=50.0,
        )
    finally:
        arw_mod.AgentRunWriter = orig_writer
    assert result["ok"] is True
    assert result["run_id"] == "run-001"
    mock_writer_cls.return_value.heartbeat.assert_called_once_with(
        "run-001", current_step="running tests", progress_pct=50.0
    )


def test_complete_agent_run_marks_done():
    import pi_agent_os.adapters.writers.agent_run_writer as arw_mod
    mock_writer_cls = MagicMock()
    orig_writer = arw_mod.AgentRunWriter
    arw_mod.AgentRunWriter = mock_writer_cls
    try:
        from pi_agent_os.mcp.server import complete_agent_run
        result = complete_agent_run(
            run_id="run-001",
            workspace_id="ws-1",
            output_summary="Fixed the bug in auth module",
            artifact_paths="src/auth.py,tests/test_auth.py",
        )
    finally:
        arw_mod.AgentRunWriter = orig_writer
    assert result["status"] == "completed"
    mock_writer_cls.return_value.update.assert_called_once()
    call_kwargs = mock_writer_cls.return_value.update.call_args
    assert call_kwargs[0][0] == "run-001"
    updates = call_kwargs[0][1]
    assert updates["status"].value == "finished"


def test_block_agent_run_marks_blocked():
    import pi_agent_os.adapters.writers.agent_run_writer as arw_mod
    mock_writer_cls = MagicMock()
    orig_writer = arw_mod.AgentRunWriter
    arw_mod.AgentRunWriter = mock_writer_cls
    try:
        from pi_agent_os.mcp.server import block_agent_run
        result = block_agent_run(
            run_id="run-001",
            workspace_id="ws-1",
            reason="Cannot proceed: missing database credentials",
        )
    finally:
        arw_mod.AgentRunWriter = orig_writer
    assert result["status"] == "blocked"
    assert "missing database credentials" in result["reason"]
    mock_writer_cls.return_value.update.assert_called_once()
    updates = mock_writer_cls.return_value.update.call_args[0][1]
    assert updates["status"].value == "blocked"


def test_build_cos_context_returns_markdown():
    import pi_agent_os.worker.cos_context as cos_mod
    mock_build = MagicMock(return_value={
        "_instruction": "## World State\n\nTasks: 3 open...",
        "goal": "implement login",
    })
    orig_build = getattr(cos_mod, "build_cos_task_packet", None)
    cos_mod.build_cos_task_packet = mock_build
    try:
        from pi_agent_os.mcp.server import build_cos_context
        result = build_cos_context(
            goal="implement login",
            project_id="proj-1",
            workspace_id="ws-1",
        )
    finally:
        if orig_build is not None:
            cos_mod.build_cos_task_packet = orig_build
        else:
            del cos_mod.build_cos_task_packet
    assert "context_markdown" in result
    assert "World State" in result["context_markdown"]
    mock_build.assert_called_once_with(
        goal="implement login",
        project_id="proj-1",
        workspace_id="ws-1",
        max_tasks=40,
        max_events=30,
    )


def test_get_workspace_status_returns_summary():
    import pi_agent_os.adapters.readers.agent_status_read as asr_mod
    import pi_agent_os.worktrees.merge_queue as mq_mod
    import pi_agent_os.analytics.metrics as metrics_mod

    run = MagicMock()
    run.run_id = "run-001"
    run.agent_role = "implementer"
    run.status = MagicMock()
    run.status.value = "running"
    run.task_id = "tsk-001"

    mock_status_cls = MagicMock()
    mock_status_cls.return_value.active_runs.return_value = [run]
    mock_status_cls.return_value.blockers.return_value = []
    mock_queue_cls = MagicMock()
    mock_queue_cls.return_value.list_queued.return_value = []
    mock_metrics_cls = MagicMock()
    mock_metrics_cls.return_value.wip_count.return_value = 2

    orig_status = asr_mod.AgentStatusReadAdapter
    orig_queue = mq_mod.MergeQueue
    orig_metrics = metrics_mod.MetricsService
    asr_mod.AgentStatusReadAdapter = mock_status_cls
    mq_mod.MergeQueue = mock_queue_cls
    metrics_mod.MetricsService = mock_metrics_cls
    try:
        from pi_agent_os.mcp.server import get_workspace_status
        result = get_workspace_status(workspace_id="ws-1")
    finally:
        asr_mod.AgentStatusReadAdapter = orig_status
        mq_mod.MergeQueue = orig_queue
        metrics_mod.MetricsService = orig_metrics

    assert result["workspace_id"] == "ws-1"
    assert result["active_runs"] == 1
    assert result["blocked_runs"] == 0
    assert result["wip_count"] == 2
    assert len(result["runs"]) == 1
    assert result["runs"][0]["role"] == "implementer"
