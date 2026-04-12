"""Tests for team template and instance system."""
import pytest
import tempfile
from pathlib import Path
from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX
from pi_agent_os.models.team import TeamTemplate, TeamSlot, TeamPolicy, TeamInstanceStatus
from pi_agent_os.teams.template import TeamTemplateWriter, TeamInstanceWriter
from pi_agent_os.policy.engine import PolicyDeniedError


@pytest.fixture
def env(tmp_path):
    import pi_agent_os.db.connection as _dbc
    # Reset thread-local connection so init_db opens a fresh connection
    if hasattr(_dbc._local, "conn") and _dbc._local.conn is not None:
        try:
            _dbc._local.conn.close()
        except Exception:
            pass
        _dbc._local.conn = None
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    # Seed workspace row to satisfy FK constraints on team_instances
    now = "2026-01-01T00:00:00+00:00"
    _dbc.execute(
        "INSERT OR IGNORE INTO workspaces (id, name, description, config_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("ws_test", "Test Workspace", "", "", "active", now, now),
    )
    return tmp_path


def _make_template(writer: TeamTemplateWriter) -> TeamTemplate:
    template = TeamTemplate(
        template_id=generate_id("team_"),
        name="Feature Build Team",
        description="Backend + tester + reviewer",
        slots=[
            TeamSlot(slot_id="s1", role="implementer_backend", required=True),
            TeamSlot(slot_id="s2", role="tester", required=True),
            TeamSlot(slot_id="s3", role="reviewer", required=False),
        ],
        policy=TeamPolicy(),
    )
    return writer.create(template)


def test_team_template_create_and_retrieve(env):
    writer = TeamTemplateWriter()
    template = _make_template(writer)

    retrieved = writer.get(template.template_id)
    assert retrieved is not None
    assert retrieved.name == "Feature Build Team"
    assert len(retrieved.slots) == 3


def test_l1_can_invoke_team(env):
    template_writer = TeamTemplateWriter()
    template = _make_template(template_writer)

    instance_writer = TeamInstanceWriter()
    instance = instance_writer.create(
        template_id=template.template_id,
        workspace_id="ws_test",
        purpose="Build auth feature",
        created_by_agent_id="agent_cos_1",
        created_by_role="chief_of_staff",  # L1
    )

    assert instance.instance_id.startswith("team_")
    assert instance.status == TeamInstanceStatus.created
    assert instance.created_by_agent_id == "agent_cos_1"


def test_non_l1_cannot_invoke_team(env):
    template_writer = TeamTemplateWriter()
    template = _make_template(template_writer)

    instance_writer = TeamInstanceWriter()
    with pytest.raises(PolicyDeniedError) as exc_info:
        instance_writer.create(
            template_id=template.template_id,
            workspace_id="ws_test",
            purpose="Attempt team invoke",
            created_by_agent_id="agent_backend_1",
            created_by_role="implementer_backend",  # NOT L1
        )

    assert "chief_of_staff" in str(exc_info.value).lower() or "l1" in str(exc_info.value).lower()


def test_only_chief_of_staff_l1_role_allowed(env):
    """Enumerate every non-L1 role and verify they all fail."""
    template_writer = TeamTemplateWriter()
    template = _make_template(template_writer)

    non_l1_roles = [
        "context_gatherer", "prd_planner", "implementation_planner", "issue_decomposer",
        "architecture_reviewer", "research_worker", "implementer_backend", "implementer_frontend",
        "refactor_worker", "browser_worker", "tester", "reviewer",
        "security_reviewer", "performance_reviewer", "integration_worker",
    ]

    writer = TeamInstanceWriter()
    for role in non_l1_roles:
        with pytest.raises(PolicyDeniedError):
            writer.create(
                template_id=template.template_id,
                workspace_id="ws_test",
                purpose="test",
                created_by_agent_id=f"agent_{role}",
                created_by_role=role,
            )


def test_team_template_slot_structure(env):
    writer = TeamTemplateWriter()
    template = _make_template(writer)

    retrieved = writer.get(template.template_id)
    slot_roles = [s.role for s in retrieved.slots]
    assert "implementer_backend" in slot_roles
    assert "tester" in slot_roles
    assert "reviewer" in slot_roles


def test_team_instance_status_update(env):
    template_writer = TeamTemplateWriter()
    template = _make_template(template_writer)

    instance_writer = TeamInstanceWriter()
    instance = instance_writer.create(
        template_id=template.template_id,
        workspace_id="ws_test",
        purpose="test",
        created_by_agent_id="cos",
        created_by_role="chief_of_staff",
    )

    instance_writer.update_status(instance.instance_id, TeamInstanceStatus.running)
    updated = instance_writer.get(instance.instance_id)
    assert updated.status == TeamInstanceStatus.running
