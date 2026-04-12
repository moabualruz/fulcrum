"""Golden scenario: research-only request. Spec §25.3 scenario 1."""
import pytest
from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX, RUN_PREFIX
from pi_agent_os.models.workspace import Workspace
from pi_agent_os.models.project import Project
from pi_agent_os.models.agent_run import AgentRun, AgentRunStatus
from pi_agent_os.adapters.writers.workspace_writer import WorkspaceWriter
from pi_agent_os.adapters.writers.project_writer import ProjectWriter
from pi_agent_os.adapters.writers.agent_run_writer import AgentRunWriter
from pi_agent_os.adapters.readers.agent_status_read import AgentStatusReadAdapter
from pi_agent_os.memory.facade import MemoryFacade
from pi_agent_os.routing.router import Router


@pytest.fixture
def env(tmp_path):
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    return tmp_path


@pytest.fixture
def ws_proj(env):
    ws = Workspace(workspace_id=generate_id(WS_PREFIX), name="Research WS")
    WorkspaceWriter().create(ws)
    proj = Project(
        project_id=generate_id(PROJ_PREFIX),
        workspace_id=ws.workspace_id,
        name="Research Project",
        project_type="git",
        root_path="/tmp",
    )
    ProjectWriter().create(proj)
    return ws, proj


def test_research_only_uses_single_agent(ws_proj):
    """L1 routes a simple research request to a single research_worker agent."""
    ws, proj = ws_proj
    router = Router()

    # L1 selects execution shape: simple research = single_agent
    shape = router.select_execution_shape(
        request_complexity="simple",
        requires_specialties=["research_worker"],
        actor_role="chief_of_staff",
    )
    assert shape in ("native_skill", "single_agent")


def test_research_agent_run_is_observable(ws_proj):
    """Research agent run status is fully queryable without LLM."""
    ws, proj = ws_proj

    run = AgentRun(
        run_id=generate_id(RUN_PREFIX),
        workspace_id=ws.workspace_id,
        project_id=proj.project_id,
        display_id="RUN-RES-1",
        agent_id="research_1",
        agent_role="research_worker",
        status=AgentRunStatus.running,
        current_step="web_search: best practices for API rate limiting",
        current_path=None,
        progress_pct=40.0,
    )
    writer = AgentRunWriter()
    writer.create(run)
    writer.heartbeat(run.run_id, current_step="analyzing results", progress_pct=80.0)

    # Query without LLM
    adapter = AgentStatusReadAdapter()
    live = adapter.get(run.run_id)

    assert live.status == AgentRunStatus.running
    assert live.current_step == "analyzing results"
    assert live.progress_pct == 80.0
    assert live.agent_role == "research_worker"


def test_research_writes_memory(ws_proj):
    """Research worker writes findings to memory."""
    ws, proj = ws_proj
    facade = MemoryFacade()

    mem_id = facade.write(
        workspace_id=ws.workspace_id,
        project_id=proj.project_id,
        title="API Rate Limiting Best Practices",
        summary="Exponential backoff + jitter is the recommended approach for rate limit retries",
        kind="research_note",
        scope="project",
        tags=["api", "rate-limiting", "best-practices"],
        importance=0.7,
    )

    # Recall the finding
    results = facade.recall("rate limiting", workspace_id=ws.workspace_id)
    assert any(r["memory_id"] == mem_id for r in results)


def test_research_only_does_not_create_team(ws_proj):
    """Research-only request must NOT invoke a team."""
    ws, proj = ws_proj
    router = Router()

    # Simple research: should NOT select team
    shape = router.select_execution_shape(
        request_complexity="simple",
        requires_specialties=["research_worker"],
        actor_role="chief_of_staff",
    )
    assert shape != "team"
