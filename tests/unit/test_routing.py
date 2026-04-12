"""Tests for routing and role system."""
import pytest
from pi_agent_os.routing.roles import (
    is_l1, can_invoke_team, get_role_description, ROLES, L1_ROLES,
)
from pi_agent_os.routing.router import Router


def test_chief_of_staff_is_l1():
    assert is_l1("chief_of_staff")


def test_non_l1_roles_are_not_l1():
    non_l1 = ["implementer_backend", "tester", "reviewer", "research_worker", "integration_worker"]
    for role in non_l1:
        assert not is_l1(role), f"{role} should not be L1"


def test_only_l1_can_invoke_team():
    assert can_invoke_team("chief_of_staff")
    assert not can_invoke_team("implementer_backend")
    assert not can_invoke_team("reviewer")


def test_all_roles_have_descriptions():
    for role in ROLES:
        desc = get_role_description(role)
        assert desc, f"Role {role} has no description"


def test_router_resolves_default(tmp_path):
    router = Router()
    decision = router.resolve("implementer_backend")
    assert decision.role == "implementer_backend"
    # No profile configured yet — stub path
    assert decision.note in ("role default", "no profile available — escalate to L1")


def test_router_task_requirement_overrides(tmp_path):
    router = Router()
    decision = router.resolve("implementer_backend", task_requirement="pi_profile_backend_v2")
    assert decision.resolved_profile == "pi_profile_backend_v2"
    assert decision.note == "task requirement override"


def test_router_preferred_profile_used():
    router = Router()
    decision = router.resolve("tester", preferred_profile="pi_profile_tester_premium")
    assert decision.resolved_profile == "pi_profile_tester_premium"
    assert decision.note == "team slot preferred"


def test_router_select_shape_native_for_simple():
    router = Router()
    shape = router.select_execution_shape("simple", [], "chief_of_staff")
    assert shape == "native_skill"


def test_router_select_shape_team_for_parallel_multi_specialty():
    router = Router()
    shape = router.select_execution_shape(
        "parallel", ["implementer_backend", "tester"], "chief_of_staff"
    )
    assert shape == "team"


def test_router_select_shape_non_l1_cannot_choose_team():
    router = Router()
    shape = router.select_execution_shape(
        "multi_phase", ["implementer_backend", "tester"], "implementer_backend"
    )
    # Non-L1 cannot choose team
    assert shape != "team"


def test_router_select_workflow_for_planning():
    router = Router()
    shape = router.select_execution_shape("planning", [], "chief_of_staff")
    assert shape == "coded_workflow"
