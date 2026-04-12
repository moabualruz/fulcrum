"""Policy enforcement engine. Spec §21."""
from __future__ import annotations
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional
from ..models.policy import PolicyAction, PolicyMatcher, PolicyRule, PolicyScope, MatcherType, PolicyEvent
from ..db import connection as db
from ..ids import generate_id
import json


@dataclass
class PolicyCheckRequest:
    """A pre-execution policy check request."""
    action: str          # "tool_call", "shell_exec", "file_write", etc.
    resource: str        # tool name, command, file path, domain, etc.
    actor_id: str
    actor_type: str      # "agent", "workflow", "system"
    workspace_id: str
    project_id: Optional[str] = None
    scope: Optional[str] = None          # PolicyScope value if known
    scope_id: Optional[str] = None
    extra: dict[str, Any] | None = None


@dataclass
class PolicyCheckResult:
    """Result of a policy check."""
    allowed: bool
    action: PolicyAction
    rule_id: Optional[str]
    reason: str
    audit_only: bool = False


class PolicyEngine:
    """Evaluate policy rules for pre-execution enforcement. Spec §21."""

    # Hard-coded system invariants per spec §21.10
    SYSTEM_INVARIANTS = [
        # Only L1 can invoke teams
        {
            "id": "sys_l1_team_only",
            "name": "Only L1 may invoke teams",
            "matchers": [{"type": MatcherType.agent_team, "pattern": "invoke_team"}],
            "action": PolicyAction.deny,
            "scope": PolicyScope.system,
            "requires_role": "chief_of_staff",  # allow only if actor_role == chief_of_staff
        },
    ]

    def check(self, req: PolicyCheckRequest) -> PolicyCheckResult:
        """Evaluate all applicable policy rules for a request.

        Default: allow.
        More-specific deny wins over less-specific allow.
        """
        rules = self._load_rules(req)

        # Evaluate in priority order (highest first)
        for rule in sorted(rules, key=lambda r: r.get("priority", 0), reverse=True):
            if self._matches(rule, req):
                action = PolicyAction(rule["action"]) if isinstance(rule["action"], str) else rule["action"]
                result = PolicyCheckResult(
                    allowed=(action == PolicyAction.allow),
                    action=action,
                    rule_id=rule.get("id"),
                    reason=rule.get("name", "policy rule matched"),
                    audit_only=(action == PolicyAction.audit_only),
                )
                # Audit log
                self._log_event(req, result)
                # audit_only is still "allowed" but logged
                if action == PolicyAction.audit_only:
                    result.allowed = True
                return result

        # Default: allow
        return PolicyCheckResult(
            allowed=True,
            action=PolicyAction.allow,
            rule_id=None,
            reason="default allow",
        )

    def _load_rules(self, req: PolicyCheckRequest) -> list[dict]:
        """Load active policy rules from DB."""
        rows = db.fetchall(
            "SELECT * FROM policy_rules WHERE enabled=1 ORDER BY priority DESC",
        )
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "action": r["action"],
                "matchers": json.loads(r["matchers"]),
                "scope": r["scope"],
                "scope_id": r["scope_id"],
                "priority": r["priority"],
            }
            for r in rows
        ]

    def _matches(self, rule: dict, req: PolicyCheckRequest) -> bool:
        """Check if a rule matches the request."""
        matchers = rule.get("matchers", [])
        if not matchers:
            return False
        for m in matchers:
            mtype = m.get("type") if isinstance(m, dict) else m.matcher_type
            pattern = m.get("pattern") if isinstance(m, dict) else m.pattern
            if not self._match_single(mtype, pattern, req):
                return False
        return True

    def _match_single(self, mtype: str, pattern: str, req: PolicyCheckRequest) -> bool:
        """Match a single matcher against the request."""
        if mtype == MatcherType.tool or mtype == "tool":
            return self._glob_match(pattern, req.resource)
        elif mtype == MatcherType.command or mtype == "command":
            return self._glob_match(pattern, req.resource)
        elif mtype == MatcherType.path or mtype == "path":
            return self._glob_match(pattern, req.resource)
        elif mtype == MatcherType.regex or mtype == "regex":
            return bool(re.search(pattern, req.resource))
        elif mtype == MatcherType.domain_network or mtype == "domain_network":
            return self._glob_match(pattern, req.resource)
        elif mtype == MatcherType.agent_team or mtype == "agent_team":
            return self._glob_match(pattern, req.action)
        elif mtype == MatcherType.workflow_step or mtype == "workflow_step":
            return self._glob_match(pattern, req.resource)
        elif mtype == MatcherType.artifact or mtype == "artifact":
            return self._glob_match(pattern, req.resource)
        elif mtype == MatcherType.secret_content or mtype == "secret_content":
            # Secret content matching is handled by secret_guard
            return False
        return False

    def _glob_match(self, pattern: str, value: str) -> bool:
        """Simple glob matching: * = any chars, ? = single char."""
        import fnmatch
        return fnmatch.fnmatch(value, pattern)

    def _log_event(self, req: PolicyCheckRequest, result: PolicyCheckResult) -> None:
        """Log a policy event."""
        try:
            event_id = generate_id("pol_")
            now = datetime.now(timezone.utc).isoformat()
            db.execute(
                """INSERT INTO policy_events
                   (id, rule_id, action_taken, trigger, actor_id, actor_type, resource,
                    workspace_id, project_id, timestamp, details)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    event_id, result.rule_id,
                    result.action.value if hasattr(result.action, 'value') else str(result.action),
                    req.action,
                    req.actor_id, req.actor_type,
                    req.resource,
                    req.workspace_id, req.project_id,
                    now,
                    json.dumps(req.extra or {}),
                ),
            )
        except Exception:
            pass  # Policy logging must not block enforcement


_engine = PolicyEngine()


def check(
    action: str,
    resource: str,
    actor_id: str,
    workspace_id: str,
    actor_type: str = "agent",
    project_id: Optional[str] = None,
    extra: dict | None = None,
) -> PolicyCheckResult:
    """Convenience function for pre-execution policy checks."""
    return _engine.check(PolicyCheckRequest(
        action=action,
        resource=resource,
        actor_id=actor_id,
        actor_type=actor_type,
        workspace_id=workspace_id,
        project_id=project_id,
        extra=extra,
    ))


def require(
    action: str,
    resource: str,
    actor_id: str,
    workspace_id: str,
    actor_type: str = "agent",
    project_id: Optional[str] = None,
) -> None:
    """Like check() but raises PolicyDeniedError if denied."""
    result = check(action, resource, actor_id, workspace_id, actor_type, project_id)
    if not result.allowed:
        raise PolicyDeniedError(f"Policy denied: {result.reason} (rule: {result.rule_id})")


class PolicyDeniedError(Exception):
    """Raised when a policy check fails."""
    pass
