"""Tests for CoS coherence wiring in WorkerLifecycle."""
from unittest.mock import patch, MagicMock


def _make_handoff(goal="Build feature X"):
    h = MagicMock()
    h.handoff_id = "hnd-001"
    h.goal = goal
    h.task_type = "planning"
    h.inputs = {}
    h.constraints = []
    h.done_criteria = "feature shipped"
    h.artifact_contract_id = None
    h.handoff_mode = "artifact_first_brief"
    h.task_id = "tsk-001"
    h.from_agent_id = "user"
    return h


def test_chief_of_staff_gets_world_state_injected():
    """task_packet for chief_of_staff must include _instruction with world state."""
    with patch("pi_agent_os.worker.lifecycle.get_pi_runtime") as mock_rt, \
         patch("pi_agent_os.worker.lifecycle.AgentRunWriter"), \
         patch("pi_agent_os.worker.lifecycle.policy_check") as mock_policy, \
         patch("pi_agent_os.worker.lifecycle.Router") as mock_router, \
         patch("pi_agent_os.worker.lifecycle.CoSContextBuilder") as mock_builder:

        mock_policy.return_value = MagicMock(allowed=True)
        mock_router.return_value.resolve.return_value = MagicMock(
            resolved_profile="chief_of_staff"
        )
        mock_builder.return_value.build.return_value = "## Current Goal\nBuild feature X"

        pi_runtime = MagicMock()
        pi_runtime.spawn_agent.return_value = "run-001"
        mock_rt.return_value = pi_runtime

        from pi_agent_os.worker.lifecycle import WorkerLifecycle
        lc = WorkerLifecycle()
        lc.start(
            handoff=_make_handoff("Build feature X"),
            agent_role="chief_of_staff",
            workspace_id="ws-1",
            project_id="proj-1",
        )

    config = pi_runtime.spawn_agent.call_args[0][0]
    assert "_instruction" in config.task_packet
    assert "Build feature X" in config.task_packet["_instruction"]
    assert "Chief of Staff" in config.task_packet["_instruction"]


def test_non_cos_agent_does_not_get_world_state():
    """Non-CoS agents must NOT get _instruction injected."""
    with patch("pi_agent_os.worker.lifecycle.get_pi_runtime") as mock_rt, \
         patch("pi_agent_os.worker.lifecycle.AgentRunWriter"), \
         patch("pi_agent_os.worker.lifecycle.policy_check") as mock_policy, \
         patch("pi_agent_os.worker.lifecycle.Router") as mock_router, \
         patch("pi_agent_os.worker.lifecycle.CoSContextBuilder") as mock_builder:

        mock_policy.return_value = MagicMock(allowed=True)
        mock_router.return_value.resolve.return_value = MagicMock(
            resolved_profile="implementer_backend"
        )

        pi_runtime = MagicMock()
        pi_runtime.spawn_agent.return_value = "run-002"
        mock_rt.return_value = pi_runtime

        from pi_agent_os.worker.lifecycle import WorkerLifecycle
        lc = WorkerLifecycle()
        lc.start(
            handoff=_make_handoff("Fix bug"),
            agent_role="implementer_backend",
            workspace_id="ws-1",
            project_id="proj-1",
        )

    mock_builder.assert_not_called()
    config = pi_runtime.spawn_agent.call_args[0][0]
    assert "_instruction" not in config.task_packet


def test_cos_without_project_id_skips_injection():
    """If project_id is None, skip injection (can't scope the query)."""
    with patch("pi_agent_os.worker.lifecycle.get_pi_runtime") as mock_rt, \
         patch("pi_agent_os.worker.lifecycle.AgentRunWriter"), \
         patch("pi_agent_os.worker.lifecycle.AgentRun"), \
         patch("pi_agent_os.worker.lifecycle.policy_check") as mock_policy, \
         patch("pi_agent_os.worker.lifecycle.Router") as mock_router, \
         patch("pi_agent_os.worker.lifecycle.CoSContextBuilder") as mock_builder:

        mock_policy.return_value = MagicMock(allowed=True)
        mock_router.return_value.resolve.return_value = MagicMock(
            resolved_profile="chief_of_staff"
        )

        pi_runtime = MagicMock()
        pi_runtime.spawn_agent.return_value = "run-003"
        mock_rt.return_value = pi_runtime

        from pi_agent_os.worker.lifecycle import WorkerLifecycle
        lc = WorkerLifecycle()
        lc.start(
            handoff=_make_handoff("Do something"),
            agent_role="chief_of_staff",
            workspace_id="ws-1",
            project_id=None,   # no project_id
        )

    mock_builder.assert_not_called()
