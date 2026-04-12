"""Golden scenario: grill-me workflow end-to-end. Spec §25."""
from __future__ import annotations
import pytest
from pathlib import Path

from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX
from pi_agent_os.db import connection as db
from pi_agent_os.memory.facade import MemoryFacade
from pi_agent_os.adapters.writers.workspace_writer import WorkspaceWriter
from pi_agent_os.adapters.writers.project_writer import ProjectWriter
from pi_agent_os.models.workspace import Workspace
from pi_agent_os.models.project import Project
from pi_agent_os.workflows.engine.runner import WorkflowRunner
from pi_agent_os.models.workflow import WorkflowRunStatus


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
        name="Test Workspace",
        description="For grill-me tests",
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
        name="Test Project",
        project_type="non_git",
        root_path="/tmp/test-project",
        write_mode="sequential",
    )
    ProjectWriter().create(proj)
    return proj


def _make_grill_workflow_dir(tmp_path: Path) -> Path:
    """Create a minimal grill-me workflow YAML."""
    wf_dir = tmp_path / "grill-me"
    wf_dir.mkdir()
    wf_yaml = wf_dir / "workflow.yaml"
    wf_yaml.write_text(
        """
name: grill_me
version: "1.0"
steps:
  - id: collect_info
    name: Collect project info
    type: run_skill
    inputs:
      skill_name: gather_context

  - id: ask_user
    name: Ask the user a clarifying question
    type: prompt_user
    inputs:
      prompt: "What is the primary goal of this project?"
    depends_on: [collect_info]

  - id: write_notes
    name: Write memory note
    type: write_memory
    inputs:
      title: "Grill-me session notes"
      summary: "User answered clarifying questions"
      kind: fact
      scope: project
    depends_on: [ask_user]

  - id: write_artifact
    name: Write output artifact
    type: write_artifact
    inputs:
      artifact_type: research
      title: "Grill-me session output"
      content: "Session completed successfully."
    depends_on: [write_notes]
"""
    )
    return wf_dir


def test_grill_me_flow_with_human_input(env, workspace, project, tmp_path, ws_id, proj_id):
    """
    Run a grill-me workflow with a human-input callback.
    Verifies memory written, artifact created, and workflow run in DB.
    """
    wf_dir = _make_grill_workflow_dir(tmp_path)
    runner = WorkflowRunner(workflow_dir=wf_dir)

    # Create a run
    run = runner.create_run(
        workspace_id=ws_id,
        project_id=proj_id,
    )
    assert run.run_id.startswith("wf_")

    # Execute with human-input callback that returns canned answer
    def on_human_input(step):
        return {"answer": "Primary goal is automated code generation."}

    completed_run = runner.execute(
        run,
        context={"workspace_id": ws_id, "project_id": proj_id},
        on_human_input=on_human_input,
    )

    # Workflow should complete
    assert completed_run.status == WorkflowRunStatus.completed

    # Workflow run should be in DB
    row = db.fetchone("SELECT * FROM workflow_runs WHERE id=?", (completed_run.run_id,))
    assert row is not None
    assert row["status"] == "completed"

    # At least one artifact should exist for this project
    art_rows = db.fetchall(
        "SELECT * FROM artifacts WHERE project_id=?", (proj_id,)
    )
    assert len(art_rows) >= 1


def test_grill_me_pauses_without_callback(env, workspace, project, tmp_path, ws_id, proj_id):
    """Without an on_human_input callback the workflow pauses at the prompt step."""
    wf_dir = _make_grill_workflow_dir(tmp_path)
    runner = WorkflowRunner(workflow_dir=wf_dir)

    run = runner.create_run(workspace_id=ws_id, project_id=proj_id)
    paused_run = runner.execute(run, on_human_input=None)

    # Should be paused at human-input step (not failed, not completed)
    assert paused_run.status == WorkflowRunStatus.waiting_input

    # Row exists in DB
    row = db.fetchone("SELECT * FROM workflow_runs WHERE id=?", (paused_run.run_id,))
    assert row is not None
    assert row["status"] == "waiting_input"


def test_grill_me_memory_written_during_flow(env, workspace, project, tmp_path, ws_id, proj_id):
    """Memory step writes a record accessible via MemoryFacade.recall()."""
    wf_dir = _make_grill_workflow_dir(tmp_path)
    runner = WorkflowRunner(workflow_dir=wf_dir)

    run = runner.create_run(workspace_id=ws_id, project_id=proj_id)

    def on_human_input(step):
        return {"answer": "Build a REST API."}

    runner.execute(
        run,
        context={"workspace_id": ws_id, "project_id": proj_id},
        on_human_input=on_human_input,
    )

    # The write_memory step should have written something to the memories table
    rows = db.fetchall("SELECT * FROM memories WHERE workspace_id=?", (ws_id,))
    assert len(rows) >= 1
