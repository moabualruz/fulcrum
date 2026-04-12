"""Tests for Pydantic models."""
import pytest
from datetime import datetime, timezone
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX, ISS_PREFIX, TASK_PREFIX
from pi_agent_os.models.workspace import Workspace
from pi_agent_os.models.issue import Issue, IssueStatus
from pi_agent_os.models.task import Task, TaskStatus
from pi_agent_os.models.events import Event, EventType
from pi_agent_os.models.handoff import HandoffPacket, HandoffMode
from pi_agent_os.models.policy import PolicyRule, PolicyAction, PolicyScope, PolicyMatcher, MatcherType


def test_workspace_model():
    ws = Workspace(
        workspace_id=generate_id(WS_PREFIX),
        name="Test",
        description="desc",
        config_path="",
    )
    assert ws.workspace_id.startswith("ws_")
    assert ws.status == "active"


def test_issue_status_enum():
    issue = Issue(
        issue_id=generate_id(ISS_PREFIX),
        workspace_id=generate_id(WS_PREFIX),
        project_id=generate_id(PROJ_PREFIX),
        display_id="ISS-1",
        title="Test issue",
        status=IssueStatus.backlog,
    )
    assert issue.status == IssueStatus.backlog


def test_task_status_transitions():
    task_id = generate_id(TASK_PREFIX)
    task = Task(
        task_id=task_id,
        workspace_id=generate_id(WS_PREFIX),
        project_id=generate_id(PROJ_PREFIX),
        display_id="TASK-1",
        title="Test task",
        status=TaskStatus.queued,
    )
    assert task.status == TaskStatus.queued


def test_event_model():
    evt = Event(
        evt_id=generate_id("evt_"),
        evt_type=EventType.issue_created,
        ts=datetime.now(timezone.utc),
        workspace_id=generate_id(WS_PREFIX),
        actor_type="system",
        actor_id="test",
    )
    assert evt.evt_type == EventType.issue_created


def test_handoff_default_mode():
    hof = HandoffPacket(
        handoff_id=generate_id("hof_"),
        from_agent_id="agent_1",
        to_agent_id="agent_2",
        project_id=generate_id(PROJ_PREFIX),
        workspace_id=generate_id(WS_PREFIX),
        goal="implement feature X",
        task_type="implementation",
        priority="high",
        scope="backend",
        constraints=[],
        done_criteria=["tests pass"],
    )
    assert hof.handoff_mode == HandoffMode.artifact_first_brief


def test_policy_rule_model():
    rule = PolicyRule(
        rule_id="pol_test",
        scope=PolicyScope.project,
        name="Block file writes outside project",
        action=PolicyAction.deny,
        matchers=[PolicyMatcher(matcher_type=MatcherType.path, pattern="/etc/*")],
    )
    assert rule.action == PolicyAction.deny
    assert len(rule.matchers) == 1
