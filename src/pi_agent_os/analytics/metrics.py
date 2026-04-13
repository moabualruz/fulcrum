"""Metrics and analytics. Spec §20."""
from __future__ import annotations
from datetime import datetime, date, timezone, timedelta
from typing import Optional
from ..db import connection as db


class MetricsService:
    """Compute metrics from operational data. Spec §20."""

    # ── Burndown ──────────────────────────────────────────────────────────────

    def issue_burndown(self, workspace_id: str, project_id: Optional[str] = None,
                        start_date: Optional[date] = None, end_date: Optional[date] = None) -> list[dict]:
        """Issue burndown: committed vs completed over time. Spec §20.2."""
        if not start_date:
            start_date = date.today() - timedelta(days=30)
        if not end_date:
            end_date = date.today()

        rows = db.fetchall(
            """SELECT date(created_at) as day,
                      COUNT(*) FILTER (WHERE status != 'cancelled') as open,
                      COUNT(*) FILTER (WHERE status = 'done') as done,
                      COUNT(*) FILTER (WHERE status = 'blocked') as blocked
               FROM issues
               WHERE workspace_id=?
               AND (? IS NULL OR project_id=?)
               AND created_at >= ? AND created_at <= ?
               GROUP BY day ORDER BY day""",
            (workspace_id, project_id, project_id,
             start_date.isoformat(), end_date.isoformat()),
        )
        return [dict(r) for r in rows]

    def task_burndown(self, workspace_id: str, project_id: Optional[str] = None) -> list[dict]:
        rows = db.fetchall(
            """SELECT date(created_at) as day,
                      COUNT(*) as created,
                      COUNT(*) FILTER (WHERE status = 'completed') as completed,
                      COUNT(*) FILTER (WHERE status = 'blocked') as blocked
               FROM tasks
               WHERE workspace_id=?
               AND (? IS NULL OR project_id=?)
               GROUP BY day ORDER BY day""",
            (workspace_id, project_id, project_id),
        )
        return [dict(r) for r in rows]

    # ── Flow Metrics ──────────────────────────────────────────────────────────

    def task_cycle_time(self, workspace_id: str, project_id: Optional[str] = None) -> Optional[float]:
        """Average task cycle time in hours (claimed→completed). Spec §20.4."""
        row = db.fetchone(
            """SELECT AVG(
                   (julianday(completed_at) - julianday(claimed_at)) * 24
               ) as avg_hours
               FROM tasks
               WHERE workspace_id=?
               AND (? IS NULL OR project_id=?)
               AND claimed_at IS NOT NULL AND completed_at IS NOT NULL""",
            (workspace_id, project_id, project_id),
        )
        return row[0] if row and row[0] is not None else None

    def wip_count(self, workspace_id: str, project_id: Optional[str] = None) -> int:
        """Current work-in-progress count."""
        row = db.fetchone(
            """SELECT COUNT(*) FROM tasks
               WHERE workspace_id=?
               AND (? IS NULL OR project_id=?)
               AND status IN ('claimed', 'running')""",
            (workspace_id, project_id, project_id),
        )
        return row[0] if row else 0

    def throughput_daily(self, workspace_id: str, days: int = 7,
                          project_id: Optional[str] = None) -> float:
        """Tasks completed per day over last N days."""
        since = (date.today() - timedelta(days=days)).isoformat()
        row = db.fetchone(
            """SELECT COUNT(*) as completed FROM tasks
               WHERE workspace_id=?
               AND (? IS NULL OR project_id=?)
               AND status = 'completed' AND completed_at >= ?""",
            (workspace_id, project_id, project_id, since),
        )
        completed = row[0] if row else 0
        return round(completed / days, 2)

    # ── Quality/Integration Metrics ───────────────────────────────────────────

    def review_rejection_rate(self, workspace_id: str) -> float:
        """Fraction of reviews resulting in changes_requested."""
        total = db.fetchone(
            "SELECT COUNT(*) FROM reviews WHERE workspace_id=?", (workspace_id,)
        )
        rejected = db.fetchone(
            "SELECT COUNT(*) FROM reviews WHERE workspace_id=? AND status='changes_requested'",
            (workspace_id,),
        )
        t = total[0] if total else 0
        r = rejected[0] if rejected else 0
        return round(r / t, 3) if t > 0 else 0.0

    def failed_run_rate(self, workspace_id: str) -> float:
        """Fraction of agent runs that failed."""
        total = db.fetchone(
            "SELECT COUNT(*) FROM agent_runs WHERE workspace_id=?", (workspace_id,)
        )
        failed = db.fetchone(
            "SELECT COUNT(*) FROM agent_runs WHERE workspace_id=? AND status IN ('failed','aborted')",
            (workspace_id,),
        )
        t = total[0] if total else 0
        f = failed[0] if failed else 0
        return round(f / t, 3) if t > 0 else 0.0

    # ── Agent/Orchestration Metrics ───────────────────────────────────────────

    def agent_run_summary(self, workspace_id: str, agent_role: Optional[str] = None) -> dict:
        where = "workspace_id=?"
        params: list = [workspace_id]
        if agent_role:
            where += " AND agent_role=?"
            params.append(agent_role)

        row = db.fetchone(
            f"""SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status='finished') as completed,
                COUNT(*) FILTER (WHERE status='blocked') as blocked,
                COUNT(*) FILTER (WHERE status IN ('failed','aborted')) as failed,
                AVG(
                    (julianday(finished_at) - julianday(started_at)) * 60
                ) FILTER (WHERE started_at IS NOT NULL AND finished_at IS NOT NULL) as avg_duration_minutes
            FROM agent_runs WHERE {where}""",
            tuple(params),
        )
        if not row:
            return {}
        return {
            "total": row[0] or 0,
            "completed": row[1] or 0,
            "blocked": row[2] or 0,
            "failed": row[3] or 0,
            "avg_duration_minutes": round(row[4], 1) if row[4] else None,
        }

    # ── Memory Analytics ──────────────────────────────────────────────────────

    def memory_scope_distribution(self, workspace_id: str) -> dict:
        rows = db.fetchall(
            "SELECT scope, COUNT(*) as count FROM memories WHERE workspace_id=? GROUP BY scope",
            (workspace_id,),
        )
        return {r["scope"]: r["count"] for r in rows}

    def memory_recall_count(self, workspace_id: str) -> int:
        row = db.fetchone(
            "SELECT COUNT(*) FROM events WHERE workspace_id=? AND evt_type='memory_recalled'",
            (workspace_id,),
        )
        return row[0] if row else 0

    # ── Daily Rollup ──────────────────────────────────────────────────────────

    def rollup_daily(self, workspace_id: str, target_date: Optional[date] = None) -> None:
        """Compute and persist daily analytics rollup."""
        d = target_date or date.today()
        d_str = d.isoformat()
        d_next = (d + timedelta(days=1)).isoformat()

        metrics = {
            "issues_created": db.fetchone(
                "SELECT COUNT(*) FROM issues WHERE workspace_id=? AND created_at >= ? AND created_at < ?",
                (workspace_id, d_str, d_next)
            )[0] or 0,
            "issues_closed": db.fetchone(
                "SELECT COUNT(*) FROM issues WHERE workspace_id=? AND status='done' AND updated_at >= ? AND updated_at < ?",
                (workspace_id, d_str, d_next)
            )[0] or 0,
            "tasks_created": db.fetchone(
                "SELECT COUNT(*) FROM tasks WHERE workspace_id=? AND created_at >= ? AND created_at < ?",
                (workspace_id, d_str, d_next)
            )[0] or 0,
            "tasks_completed": db.fetchone(
                "SELECT COUNT(*) FROM tasks WHERE workspace_id=? AND status='completed' AND updated_at >= ? AND updated_at < ?",
                (workspace_id, d_str, d_next)
            )[0] or 0,
            "runs_started": db.fetchone(
                "SELECT COUNT(*) FROM agent_runs WHERE workspace_id=? AND created_at >= ? AND created_at < ?",
                (workspace_id, d_str, d_next)
            )[0] or 0,
            "memory_writes": db.fetchone(
                "SELECT COUNT(*) FROM memories WHERE workspace_id=? AND created_at >= ? AND created_at < ?",
                (workspace_id, d_str, d_next)
            )[0] or 0,
        }

        now = datetime.now(timezone.utc).isoformat()
        rollup_id = f"daily_{workspace_id}_{d_str}"
        db.execute(
            """INSERT OR REPLACE INTO analytics_daily
               (id, workspace_id, project_id, date, issues_created, issues_closed,
                tasks_created, tasks_completed, runs_started, memory_writes)
               VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)""",
            (rollup_id, workspace_id, d_str,
             metrics["issues_created"], metrics["issues_closed"],
             metrics["tasks_created"], metrics["tasks_completed"],
             metrics["runs_started"], metrics["memory_writes"]),
        )

    # ── Per-role orchestration metrics ────────────────────────────────────────

    def per_role_metrics(self, workspace_id: str) -> list[dict]:
        """
        Per-role agent latency, retry rate, and blocked rate. Spec §20.5.

        Returns a list sorted by total runs descending.
        """
        rows = db.fetchall(
            """SELECT
                agent_role,
                COUNT(*) as total_runs,
                COUNT(*) FILTER (WHERE status='finished') as completed,
                COUNT(*) FILTER (WHERE status IN ('failed','aborted')) as failed,
                COUNT(*) FILTER (WHERE status='blocked') as blocked,
                AVG(
                    (julianday(finished_at) - julianday(started_at)) * 60
                ) FILTER (WHERE started_at IS NOT NULL AND finished_at IS NOT NULL) as avg_duration_minutes
            FROM agent_runs WHERE workspace_id=?
            GROUP BY agent_role
            ORDER BY total_runs DESC""",
            (workspace_id,),
        )
        result = []
        for r in rows:
            total = r["total_runs"] or 1  # avoid division by zero
            result.append({
                "agent_role": r["agent_role"],
                "total_runs": r["total_runs"] or 0,
                "completed": r["completed"] or 0,
                "failed": r["failed"] or 0,
                "blocked": r["blocked"] or 0,
                "fail_rate": round((r["failed"] or 0) / total, 3),
                "block_rate": round((r["blocked"] or 0) / total, 3),
                "avg_duration_minutes": round(r["avg_duration_minutes"], 1) if r["avg_duration_minutes"] else None,
            })
        return result

    def memory_effectiveness(self, workspace_id: str) -> dict:
        """
        Memory effectiveness indicators. Spec §20.6.

        Returns counts by scope, kind, and recent recall activity.
        """
        by_scope = self.memory_scope_distribution(workspace_id)
        by_kind_rows = db.fetchall(
            "SELECT kind, COUNT(*) as count FROM memories WHERE workspace_id=? GROUP BY kind",
            (workspace_id,),
        )
        recent_recalls = self.memory_recall_count(workspace_id)
        total_memories = sum(by_scope.values()) if by_scope else 0
        return {
            "total_memories": total_memories,
            "by_scope": by_scope,
            "by_kind": {r["kind"]: r["count"] for r in by_kind_rows},
            "recall_events": recent_recalls,
            "memories_per_recall": round(total_memories / max(recent_recalls, 1), 1),
        }

    def forecasting_advisory(self, workspace_id: str, project_id: Optional[str] = None) -> dict:
        """
        Velocity-based delivery forecast stub. Spec §20.7.

        Uses recent throughput to estimate remaining work duration.
        Returns advisory data — treat as a rough signal, not a commitment.
        """
        # Open issues
        clauses = ["workspace_id=?", "status NOT IN ('done', 'cancelled')"]
        params: list = [workspace_id]
        if project_id:
            clauses.append("project_id=?")
            params.append(project_id)
        open_row = db.fetchone(
            f"SELECT COUNT(*) as n FROM issues WHERE {' AND '.join(clauses)}", tuple(params)
        )
        open_issues = open_row["n"] if open_row else 0

        # Recent velocity (tasks completed per day over last 7 days)
        avg_daily = self.throughput_daily(workspace_id, days=7, project_id=project_id)

        if avg_daily > 0:
            est_days = round(open_issues / avg_daily, 1)
            confidence = "low" if avg_daily < 0.5 else "medium" if avg_daily < 2 else "high"
        else:
            est_days = None
            confidence = "insufficient_data"

        return {
            "workspace_id": workspace_id,
            "project_id": project_id,
            "open_issues": open_issues,
            "avg_daily_velocity": round(avg_daily, 2),
            "estimated_days_remaining": est_days,
            "confidence": confidence,
            "note": "Forecast is advisory only — based on recent throughput, not commitment.",
        }
