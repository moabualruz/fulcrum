"""Tests for TeamScheduler concurrency caps."""
from __future__ import annotations
import pytest
from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX
from pi_agent_os.models.team import TeamTemplate, TeamSlot, TeamPolicy, TeamInstanceStatus
from pi_agent_os.teams.template import TeamTemplateWriter, TeamInstanceWriter
from pi_agent_os.teams.scheduler import TeamScheduler, TeamSchedulerConfig
import pi_agent_os.db.connection as _dbc


@pytest.fixture
def env(tmp_path):
    if hasattr(_dbc._local, "conn") and _dbc._local.conn is not None:
        try:
            _dbc._local.conn.close()
        except Exception:
            pass
        _dbc._local.conn = None
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    ws_id = generate_id(WS_PREFIX)
    proj_id = generate_id(PROJ_PREFIX)
    now = "2026-01-01T00:00:00+00:00"
    _dbc.execute(
        "INSERT INTO workspaces (id, name, description, config_path, status, created_at, updated_at) "
        "VALUES (?, 'Test WS', '', '', 'active', ?, ?)",
        (ws_id, now, now),
    )
    _dbc.execute(
        "INSERT INTO projects (id, workspace_id, name, description, project_type, root_path, "
        "default_branch, status, write_mode, created_at, updated_at) "
        "VALUES (?, ?, 'Test Project', '', 'git', '/tmp', 'main', 'active', 'worktree', ?, ?)",
        (proj_id, ws_id, now, now),
    )
    return {"ws_id": ws_id, "proj_id": proj_id}


def _make_template(name: str = "Feature Team") -> TeamTemplate:
    return TeamTemplateWriter().create(TeamTemplate(
        template_id=generate_id("team_"),
        name=name,
        description="",
        slots=[TeamSlot(slot_id="s1", role="implementer_backend", required=True)],
        policy=TeamPolicy(),
    ))


def _spawn_running_instance(ws_id: str, template_id: str, proj_id: str | None = None) -> str:
    """Create a team instance and immediately set it to running."""
    writer = TeamInstanceWriter()
    inst = writer.create(
        template_id=template_id,
        workspace_id=ws_id,
        purpose="test",
        created_by_agent_id="cos",
        created_by_role="chief_of_staff",
        project_id=proj_id,
    )
    writer.update_status(inst.instance_id, TeamInstanceStatus.running)
    return inst.instance_id


# ── can_start ──────────────────────────────────────────────────────────────

def test_can_start_when_nothing_running(env):
    ws_id = env["ws_id"]
    template = _make_template()
    scheduler = TeamScheduler()
    decision = scheduler.can_start(ws_id, project_id=None, template_id=template.template_id)
    assert decision.allowed is True
    assert decision.running_global == 0


def test_global_cap_blocks_new_instance(env):
    ws_id, proj_id = env["ws_id"], env["proj_id"]
    template = _make_template()
    # global_cap=2 — spawn 2 running instances
    scheduler = TeamScheduler(TeamSchedulerConfig(global_cap=2, per_project_cap=10, per_template_cap=10))
    _spawn_running_instance(ws_id, template.template_id, proj_id)
    _spawn_running_instance(ws_id, template.template_id, proj_id)

    decision = scheduler.can_start(ws_id, project_id=proj_id, template_id=template.template_id)
    assert decision.allowed is False
    assert "global cap" in decision.reason.lower()
    assert decision.running_global == 2


def test_per_project_cap_blocks(env):
    ws_id, proj_id = env["ws_id"], env["proj_id"]
    template = _make_template()
    # per_project_cap=1, global_cap=10
    scheduler = TeamScheduler(TeamSchedulerConfig(global_cap=10, per_project_cap=1, per_template_cap=10))
    _spawn_running_instance(ws_id, template.template_id, proj_id)

    decision = scheduler.can_start(ws_id, project_id=proj_id, template_id=template.template_id)
    assert decision.allowed is False
    assert "per-project cap" in decision.reason.lower()


def test_per_template_cap_blocks(env):
    ws_id, proj_id = env["ws_id"], env["proj_id"]
    template = _make_template()
    other_proj = generate_id(PROJ_PREFIX)
    # per_template_cap=1, global_cap=10, per_project_cap=10
    scheduler = TeamScheduler(TeamSchedulerConfig(global_cap=10, per_project_cap=10, per_template_cap=1))
    _spawn_running_instance(ws_id, template.template_id, proj_id)

    # Different project, but same template — still blocked
    decision = scheduler.can_start(ws_id, project_id=other_proj, template_id=template.template_id)
    assert decision.allowed is False
    assert "per-template cap" in decision.reason.lower()


def test_different_template_not_blocked(env):
    ws_id, proj_id = env["ws_id"], env["proj_id"]
    t1 = _make_template("Team A")
    t2 = _make_template("Team B")
    # per_template_cap=1
    scheduler = TeamScheduler(TeamSchedulerConfig(global_cap=10, per_project_cap=10, per_template_cap=1))
    _spawn_running_instance(ws_id, t1.template_id, proj_id)

    # t2 is different template — not blocked
    decision = scheduler.can_start(ws_id, project_id=proj_id, template_id=t2.template_id)
    assert decision.allowed is True


def test_completed_instances_dont_count(env):
    ws_id, proj_id = env["ws_id"], env["proj_id"]
    template = _make_template()
    scheduler = TeamScheduler(TeamSchedulerConfig(global_cap=1, per_project_cap=1, per_template_cap=1))
    # Create and complete an instance
    writer = TeamInstanceWriter()
    inst = writer.create(
        template_id=template.template_id,
        workspace_id=ws_id,
        purpose="finished work",
        created_by_agent_id="cos",
        created_by_role="chief_of_staff",
        project_id=proj_id,
    )
    writer.update_status(inst.instance_id, TeamInstanceStatus.completed)

    # Global cap is 1, but no running instances — should be allowed
    decision = scheduler.can_start(ws_id, project_id=proj_id, template_id=template.template_id)
    assert decision.allowed is True
    assert decision.running_global == 0


# ── concurrency_report ────────────────────────────────────────────────────

def test_concurrency_report_empty(env):
    ws_id = env["ws_id"]
    report = TeamScheduler().concurrency_report(ws_id)
    assert report["running_total"] == 0
    assert report["global_headroom"] == 8  # default global_cap=8
    assert report["per_template"] == {}
    assert report["per_project"] == {}


def test_concurrency_report_reflects_running_instances(env):
    ws_id, proj_id = env["ws_id"], env["proj_id"]
    template = _make_template()
    _spawn_running_instance(ws_id, template.template_id, proj_id)
    _spawn_running_instance(ws_id, template.template_id, proj_id)

    report = TeamScheduler().concurrency_report(ws_id)
    assert report["running_total"] == 2
    assert report["per_template"][template.template_id] == 2
    assert report["per_project"][proj_id] == 2


# ── list_running ──────────────────────────────────────────────────────────

def test_list_running_returns_only_running(env):
    ws_id, proj_id = env["ws_id"], env["proj_id"]
    template = _make_template()
    writer = TeamInstanceWriter()

    # One running, one completed
    running = writer.create(
        template_id=template.template_id, workspace_id=ws_id,
        purpose="active", created_by_agent_id="cos",
        created_by_role="chief_of_staff", project_id=proj_id,
    )
    writer.update_status(running.instance_id, TeamInstanceStatus.running)

    done = writer.create(
        template_id=template.template_id, workspace_id=ws_id,
        purpose="done", created_by_agent_id="cos",
        created_by_role="chief_of_staff", project_id=proj_id,
    )
    writer.update_status(done.instance_id, TeamInstanceStatus.completed)

    running_list = TeamScheduler().list_running(ws_id)
    ids = [r["id"] for r in running_list]
    assert running.instance_id in ids
    assert done.instance_id not in ids
