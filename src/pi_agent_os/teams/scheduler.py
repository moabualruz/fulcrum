"""
Cross-team scheduler — enforces concurrency caps across team instances.

Spec §15.4 (concurrency), §15.5 (per-slot caps), §4.1 (L1-only).

Caps are evaluated in order:
  1. global cap (max total running team instances across entire workspace)
  2. per-project cap (max running team instances within one project)
  3. per-template cap (max running instances of the same template)

All caps default to permissive values unless overridden via TeamSchedulerConfig.
"""
from __future__ import annotations
import logging
from dataclasses import dataclass, field
from typing import Optional

from ..db import connection as db
from ..models.team import TeamInstanceStatus
from .template import TeamInstanceWriter

log = logging.getLogger(__name__)


@dataclass
class TeamSchedulerConfig:
    """Concurrency limits for the scheduler."""
    global_cap: int = 8          # total running team instances across workspace
    per_project_cap: int = 4     # running instances within one project
    per_template_cap: int = 2    # running instances of the same template


@dataclass
class ScheduleDecision:
    allowed: bool
    reason: str
    running_global: int = 0
    running_project: int = 0
    running_template: int = 0


class TeamScheduler:
    """
    Decides whether a new team instance may start given current concurrency.

    Design:
    - Reads live counts from team_instances table (status='running')
    - Returns a ScheduleDecision (never mutates team state)
    - Caller (typically TeamInstanceWriter.create + WorkerLifecycle) acts on the decision
    """

    def __init__(self, config: Optional[TeamSchedulerConfig] = None):
        self.config = config or TeamSchedulerConfig()

    def can_start(
        self,
        workspace_id: str,
        project_id: Optional[str],
        template_id: str,
    ) -> ScheduleDecision:
        """
        Check whether a new team instance may start.

        Returns ScheduleDecision.allowed=True if all caps are satisfied.
        """
        running_global = self._count_running(workspace_id=workspace_id)
        running_project = (
            self._count_running(workspace_id=workspace_id, project_id=project_id)
            if project_id else 0
        )
        running_template = self._count_running(
            workspace_id=workspace_id, template_id=template_id
        )

        if running_global >= self.config.global_cap:
            return ScheduleDecision(
                allowed=False,
                reason=f"Global cap reached: {running_global}/{self.config.global_cap} team instances running",
                running_global=running_global,
                running_project=running_project,
                running_template=running_template,
            )

        if project_id and running_project >= self.config.per_project_cap:
            return ScheduleDecision(
                allowed=False,
                reason=f"Per-project cap reached: {running_project}/{self.config.per_project_cap} team instances running in project {project_id}",
                running_global=running_global,
                running_project=running_project,
                running_template=running_template,
            )

        if running_template >= self.config.per_template_cap:
            return ScheduleDecision(
                allowed=False,
                reason=f"Per-template cap reached: {running_template}/{self.config.per_template_cap} instances of template {template_id} already running",
                running_global=running_global,
                running_project=running_project,
                running_template=running_template,
            )

        return ScheduleDecision(
            allowed=True,
            reason="all caps satisfied",
            running_global=running_global,
            running_project=running_project,
            running_template=running_template,
        )

    def list_running(
        self,
        workspace_id: str,
        project_id: Optional[str] = None,
        template_id: Optional[str] = None,
    ) -> list[dict]:
        """Return running team instances, optionally filtered."""
        clauses = ["workspace_id=?", f"status='{TeamInstanceStatus.running.value}'"]
        params: list = [workspace_id]
        if project_id:
            clauses.append("project_id=?")
            params.append(project_id)
        if template_id:
            clauses.append("template_id=?")
            params.append(template_id)
        where = " AND ".join(clauses)
        rows = db.fetchall(
            f"SELECT * FROM team_instances WHERE {where} ORDER BY created_at DESC",
            tuple(params),
        )
        return [dict(r) for r in rows]

    def concurrency_report(self, workspace_id: str) -> dict:
        """
        Return a full concurrency snapshot for a workspace.
        Queryable without LLM (spec §19).
        """
        total_running = self._count_running(workspace_id)
        rows = db.fetchall(
            """SELECT template_id, COUNT(*) as count
               FROM team_instances
               WHERE workspace_id=? AND status=?
               GROUP BY template_id""",
            (workspace_id, TeamInstanceStatus.running.value),
        )
        per_template = {r["template_id"]: r["count"] for r in rows}

        proj_rows = db.fetchall(
            """SELECT project_id, COUNT(*) as count
               FROM team_instances
               WHERE workspace_id=? AND status=? AND project_id IS NOT NULL
               GROUP BY project_id""",
            (workspace_id, TeamInstanceStatus.running.value),
        )
        per_project = {r["project_id"]: r["count"] for r in proj_rows}

        return {
            "workspace_id": workspace_id,
            "running_total": total_running,
            "global_cap": self.config.global_cap,
            "per_project_cap": self.config.per_project_cap,
            "per_template_cap": self.config.per_template_cap,
            "global_headroom": max(0, self.config.global_cap - total_running),
            "per_template": per_template,
            "per_project": per_project,
        }

    def _count_running(
        self,
        workspace_id: str,
        project_id: Optional[str] = None,
        template_id: Optional[str] = None,
    ) -> int:
        clauses = ["workspace_id=?", f"status='{TeamInstanceStatus.running.value}'"]
        params: list = [workspace_id]
        if project_id:
            clauses.append("project_id=?")
            params.append(project_id)
        if template_id:
            clauses.append("template_id=?")
            params.append(template_id)
        where = " AND ".join(clauses)
        row = db.fetchone(
            f"SELECT COUNT(*) as n FROM team_instances WHERE {where}", tuple(params)
        )
        return row["n"] if row else 0
