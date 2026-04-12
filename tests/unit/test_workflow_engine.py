"""Tests for the workflow engine."""
import pytest
import tempfile
from pathlib import Path
import yaml
from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home
from pi_agent_os.models.workflow import WorkflowRunStatus, WorkflowStepStatus
from pi_agent_os.workflows.engine.runner import WorkflowRunner


@pytest.fixture
def temp_env(tmp_path):
    configure_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    # Seed workspace and project rows to satisfy FK constraints
    from pi_agent_os.db.connection import execute as db_execute
    now = "2026-01-01T00:00:00+00:00"
    db_execute(
        "INSERT OR IGNORE INTO workspaces (id, name, description, config_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("ws_test", "Test Workspace", "", "", "active", now, now),
    )
    db_execute(
        "INSERT OR IGNORE INTO projects (id, workspace_id, name, description, project_type, root_path, status, write_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("proj_test", "ws_test", "Test Project", "", "git", "", "active", "sequential", now, now),
    )
    return tmp_path


@pytest.fixture
def simple_workflow_dir(tmp_path):
    wf_dir = tmp_path / "simple-wf"
    wf_dir.mkdir()
    (wf_dir / "workflow.yaml").write_text(yaml.dump({
        "name": "simple-test",
        "version": "1.0",
        "steps": [
            {"id": "step1", "name": "Step 1", "type": "run_skill"},
            {"id": "step2", "name": "Step 2", "type": "run_skill", "depends_on": ["step1"]},
            {"id": "step3", "name": "Complete", "type": "complete", "depends_on": ["step2"]},
        ]
    }))
    return wf_dir


@pytest.fixture
def human_input_workflow_dir(tmp_path):
    wf_dir = tmp_path / "human-wf"
    wf_dir.mkdir()
    (wf_dir / "workflow.yaml").write_text(yaml.dump({
        "name": "human-test",
        "version": "1.0",
        "steps": [
            {"id": "ask_user", "name": "Ask user", "type": "prompt_user",
             "inputs": {"prompt": "What do you need?"}},
            {"id": "complete", "name": "Done", "type": "complete", "depends_on": ["ask_user"]},
        ]
    }))
    return wf_dir


def test_workflow_run_created(temp_env, simple_workflow_dir):
    runner = WorkflowRunner(simple_workflow_dir)
    run = runner.create_run(workspace_id="ws_test", project_id="proj_test")
    assert run.run_id.startswith("wf_")
    assert run.status == WorkflowRunStatus.created
    assert len(run.steps) == 3


def test_workflow_executes_linear(temp_env, simple_workflow_dir):
    runner = WorkflowRunner(simple_workflow_dir)
    run = runner.create_run(workspace_id="ws_test", project_id="proj_test")
    completed_run = runner.execute(run)
    assert completed_run.status == WorkflowRunStatus.completed
    for step in completed_run.steps:
        assert step.status == WorkflowStepStatus.completed


def test_workflow_pauses_on_human_input(temp_env, human_input_workflow_dir):
    runner = WorkflowRunner(human_input_workflow_dir)
    run = runner.create_run(workspace_id="ws_test", project_id="proj_test")
    # No on_human_input callback — should pause
    paused_run = runner.execute(run)
    assert paused_run.status == WorkflowRunStatus.waiting_input


def test_workflow_resumes_with_human_input(temp_env, human_input_workflow_dir):
    runner = WorkflowRunner(human_input_workflow_dir)
    run = runner.create_run(workspace_id="ws_test", project_id="proj_test")

    def mock_human_input(step):
        return {"answer": "I need a feature built"}

    completed_run = runner.execute(run, on_human_input=mock_human_input)
    assert completed_run.status == WorkflowRunStatus.completed


def test_team_invocation_blocked_for_non_l1(temp_env, tmp_path):
    """Only L1 chief_of_staff may invoke teams (spec §13.11)."""
    wf_dir = tmp_path / "team-wf"
    wf_dir.mkdir()
    (wf_dir / "workflow.yaml").write_text(yaml.dump({
        "name": "team-test",
        "version": "1.0",
        "steps": [
            {"id": "invoke", "name": "Invoke team", "type": "invoke_team"},
        ]
    }))
    runner = WorkflowRunner(wf_dir)
    run = runner.create_run(workspace_id="ws_test", project_id="proj_test")
    # Non-L1 actor
    failed_run = runner.execute(run, context={"actor_role": "implementer_backend"})
    assert failed_run.status == WorkflowRunStatus.failed


def test_team_invocation_allowed_for_l1(temp_env, tmp_path):
    """L1 chief_of_staff CAN invoke teams."""
    wf_dir = tmp_path / "team-wf2"
    wf_dir.mkdir()
    (wf_dir / "workflow.yaml").write_text(yaml.dump({
        "name": "team-test2",
        "version": "1.0",
        "steps": [
            {"id": "invoke", "name": "Invoke team", "type": "invoke_team"},
        ]
    }))
    runner = WorkflowRunner(wf_dir)
    run = runner.create_run(workspace_id="ws_test", project_id="proj_test")
    completed_run = runner.execute(run, context={"actor_role": "chief_of_staff"})
    assert completed_run.status == WorkflowRunStatus.completed


def test_workflow_validate_schema_fails_on_missing_keys(temp_env, tmp_path):
    wf_dir = tmp_path / "validate-wf"
    wf_dir.mkdir()
    (wf_dir / "workflow.yaml").write_text(yaml.dump({
        "name": "validate-test",
        "version": "1.0",
        "steps": [
            {"id": "validate", "name": "Validate", "type": "validate_schema",
             "inputs": {"required_keys": ["title", "description"], "data": {"title": "ok"}}},
        ]
    }))
    runner = WorkflowRunner(wf_dir)
    run = runner.create_run(workspace_id="ws_test", project_id="proj_test")
    failed_run = runner.execute(run)
    assert failed_run.status == WorkflowRunStatus.failed


def test_workflow_persisted_and_reloadable(temp_env, simple_workflow_dir):
    runner = WorkflowRunner(simple_workflow_dir)
    run = runner.create_run(workspace_id="ws_test", project_id="proj_test")
    completed = runner.execute(run)
    # Reload from DB
    from pi_agent_os.workflows.engine.runner import _reload_run
    reloaded = _reload_run(completed.run_id)
    assert reloaded.status == WorkflowRunStatus.completed
    assert reloaded.run_id == completed.run_id
