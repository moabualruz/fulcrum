"""TeamTemplate and slot resolution. Spec §15.1, §15.3."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Any, Optional
from ..ids import generate_id, TEAM_PREFIX
from ..models.team import TeamTemplate, TeamInstance, TeamSlot, TeamPolicy, TeamInstanceStatus
from ..db import connection as db
from ..events.store import emit
from ..models.events import EventType
from ..policy.engine import PolicyDeniedError
from ..routing.roles import can_invoke_team


class TeamTemplateWriter:
    """Persist and manage TeamTemplates."""

    def create(self, template: TeamTemplate) -> TeamTemplate:
        now = datetime.now(timezone.utc).isoformat()
        db.execute(
            "INSERT INTO team_templates (id, name, description, slots, policy, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                template.template_id, template.name, template.description,
                json.dumps([s.model_dump(mode='json') for s in template.slots]),
                json.dumps(template.policy.model_dump(mode='json') if template.policy else {}),
                now, now,
            ),
        )
        return template

    def get(self, template_id: str) -> Optional[TeamTemplate]:
        row = db.fetchone("SELECT * FROM team_templates WHERE id=?", (template_id,))
        return _row_to_template(row) if row else None

    def list(self) -> list[TeamTemplate]:
        rows = db.fetchall("SELECT * FROM team_templates ORDER BY name")
        return [_row_to_template(r) for r in rows]


class TeamInstanceWriter:
    """Manage TeamInstance lifecycle. Spec §15.2: only L1 may invoke teams."""

    def create(
        self,
        template_id: str,
        workspace_id: str,
        purpose: str,
        created_by_agent_id: str,
        created_by_role: str,
        project_id: Optional[str] = None,
        task_id: Optional[str] = None,
    ) -> TeamInstance:
        """
        Create a team instance. ENFORCES L1-only rule.

        Raises PolicyDeniedError if invoker is not L1.
        """
        # Hard enforcement: only L1 may create teams (spec §4.1, §15.2)
        if not can_invoke_team(created_by_role):
            raise PolicyDeniedError(
                f"Policy denied: only chief_of_staff (L1) may invoke teams. "
                f"Got role: '{created_by_role}'. "
                "Other agents may only recommend team usage."
            )

        now = datetime.now(timezone.utc).isoformat()
        instance = TeamInstance(
            instance_id=generate_id(TEAM_PREFIX),
            template_id=template_id,
            workspace_id=workspace_id,
            project_id=project_id,
            status=TeamInstanceStatus.created,
            purpose=purpose,
            task_id=task_id,
            created_by_agent_id=created_by_agent_id,
        )
        db.execute(
            """INSERT INTO team_instances
               (id, template_id, workspace_id, project_id, status, purpose,
                task_id, created_by_agent_id, resolved_slots, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                instance.instance_id, template_id, workspace_id, project_id,
                instance.status.value if hasattr(instance.status, 'value') else str(instance.status),
                purpose, task_id, created_by_agent_id,
                json.dumps({}), now, now,
            ),
        )
        # Update projection
        db.execute(
            """INSERT OR REPLACE INTO team_state_projection
               (instance_id, workspace_id, project_id, template_id, status, purpose, active_member_count, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 0, ?)""",
            (instance.instance_id, workspace_id, project_id, template_id,
             str(instance.status), purpose, now),
        )
        emit(
            EventType.team_invoked,
            workspace_id=workspace_id,
            actor_type="agent",
            actor_id=created_by_agent_id,
            object_type="team_instance",
            object_id=instance.instance_id,
            project_id=project_id,
            payload={"template_id": template_id, "purpose": purpose},
        )
        return instance

    def get(self, instance_id: str) -> Optional[TeamInstance]:
        row = db.fetchone("SELECT * FROM team_instances WHERE id=?", (instance_id,))
        return _row_to_instance(row) if row else None

    def update_status(self, instance_id: str, status: TeamInstanceStatus) -> None:
        now = datetime.now(timezone.utc).isoformat()
        db.execute(
            "UPDATE team_instances SET status=?, updated_at=? WHERE id=?",
            (status.value if hasattr(status, 'value') else str(status), now, instance_id),
        )
        db.execute(
            "UPDATE team_state_projection SET status=?, updated_at=? WHERE instance_id=?",
            (str(status), now, instance_id),
        )


def _row_to_template(row: Any) -> TeamTemplate:
    slots_data = json.loads(row["slots"] or "[]")
    policy_data = json.loads(row["policy"] or "{}")
    return TeamTemplate(
        template_id=row["id"],
        name=row["name"],
        description=row["description"] or "",
        slots=[TeamSlot(**s) for s in slots_data],
        policy=TeamPolicy(**policy_data) if policy_data else TeamPolicy(),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def _row_to_instance(row: Any) -> TeamInstance:
    return TeamInstance(
        instance_id=row["id"],
        template_id=row["template_id"],
        workspace_id=row["workspace_id"],
        project_id=row["project_id"],
        status=TeamInstanceStatus(row["status"]),
        purpose=row["purpose"],
        task_id=row["task_id"],
        created_by_agent_id=row["created_by_agent_id"],
        resolved_slots=json.loads(row["resolved_slots"] or "{}"),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )
