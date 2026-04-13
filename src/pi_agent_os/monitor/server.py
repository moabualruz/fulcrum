"""Read-only monitor server with SSE. Spec §19.1, §19.3, §19.11."""
from __future__ import annotations
import json
import asyncio
from datetime import datetime, timezone
from typing import Optional, AsyncGenerator
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse
from ..db import connection as db
from ..events.store import tail as events_tail
from ..analytics.metrics import MetricsService

app = FastAPI(
    title="PI Agent OS Monitor",
    description="Read-only mission control — spec §19.11",
    version="0.1.0",
)


def create_app() -> FastAPI:
    """Return the monitor FastAPI application instance."""
    return app

_metrics = MetricsService()


# ── Global command center ────────────────────────────────────────────────────

@app.get("/api/v1/status")
def global_status(workspace_id: str = Query(...)):
    """Global command center overview."""
    running_agents = db.fetchall(
        "SELECT id, agent_role, status, current_step, progress_pct, heartbeat_at FROM agent_runs "
        "WHERE workspace_id=? AND status IN ('running','starting','waiting') ORDER BY updated_at DESC",
        (workspace_id,),
    )
    blocked_agents = db.fetchall(
        "SELECT id, agent_role, blocker, updated_at FROM agent_runs "
        "WHERE workspace_id=? AND status='blocked'", (workspace_id,),
    )
    recent_events = events_tail(workspace_id=workspace_id, limit=10)
    wip = _metrics.wip_count(workspace_id)

    return {
        "workspace_id": workspace_id,
        "ts": datetime.now(timezone.utc).isoformat(),
        "running_agents": [dict(r) for r in running_agents],
        "blocked_agents": [dict(r) for r in blocked_agents],
        "wip_count": wip,
        "recent_events": recent_events[:5],
    }


# ── Project board ────────────────────────────────────────────────────────────

@app.get("/api/v1/board")
def board(workspace_id: str = Query(...),
          project_id: Optional[str] = Query(None),
          item_type: str = Query("issue")):
    """Project board — board_items projection."""
    clauses = ["workspace_id=?", "item_type=?"]
    params: list = [workspace_id, item_type]
    if project_id:
        clauses.append("project_id=?")
        params.append(project_id)
    where = " AND ".join(clauses)
    rows = db.fetchall(
        f"SELECT * FROM board_items WHERE {where} ORDER BY status, priority DESC LIMIT 200",
        tuple(params),
    )
    return {"items": [dict(r) for r in rows]}


# ── Agent fleet ──────────────────────────────────────────────────────────────

@app.get("/api/v1/agents")
def agent_fleet(workspace_id: str = Query(...), status: Optional[str] = Query(None)):
    """Agent fleet view — all agents and their live status."""
    clauses = ["workspace_id=?"]
    params: list = [workspace_id]
    if status:
        clauses.append("status=?")
        params.append(status)
    where = " AND ".join(clauses)
    rows = db.fetchall(
        f"SELECT * FROM agent_state_projection WHERE {where} ORDER BY updated_at DESC LIMIT 100",
        tuple(params),
    )
    return {"agents": [dict(r) for r in rows]}


@app.get("/api/v1/agents/{run_id}")
def agent_detail(run_id: str):
    """Single agent run detail."""
    row = db.fetchone("SELECT * FROM agent_runs WHERE id=?", (run_id,))
    return dict(row) if row else {"error": "Not found"}


# ── Merge queue ──────────────────────────────────────────────────────────────

@app.get("/api/v1/merge-queue")
def merge_queue(workspace_id: str = Query(...)):
    rows = db.fetchall(
        "SELECT * FROM merge_queue_projection WHERE workspace_id=? ORDER BY queued_at ASC",
        (workspace_id,),
    )
    return {"queue": [dict(r) for r in rows]}


# ── Review queue ─────────────────────────────────────────────────────────────

@app.get("/api/v1/review-queue")
def review_queue(workspace_id: str = Query(...)):
    rows = db.fetchall(
        "SELECT * FROM review_queue_projection WHERE workspace_id=? ORDER BY updated_at DESC",
        (workspace_id,),
    )
    return {"queue": [dict(r) for r in rows]}


# ── Artifact browser ─────────────────────────────────────────────────────────

@app.get("/api/v1/artifacts")
def artifacts(workspace_id: str = Query(...),
              project_id: Optional[str] = Query(None),
              artifact_type: Optional[str] = Query(None)):
    clauses = ["workspace_id=?"]
    params: list = [workspace_id]
    if project_id:
        clauses.append("project_id=?")
        params.append(project_id)
    if artifact_type:
        clauses.append("artifact_type=?")
        params.append(artifact_type)
    where = " AND ".join(clauses)
    rows = db.fetchall(
        f"SELECT * FROM artifacts WHERE {where} ORDER BY created_at DESC LIMIT 100",
        tuple(params),
    )
    return {"artifacts": [dict(r) for r in rows]}


# ── Memory trace ─────────────────────────────────────────────────────────────

@app.get("/api/v1/memory-trace")
def memory_trace(workspace_id: str = Query(...),
                  project_id: Optional[str] = Query(None),
                  limit: int = Query(50)):
    clauses = ["workspace_id=?"]
    params: list = [workspace_id]
    if project_id:
        clauses.append("project_id=?")
        params.append(project_id)
    where = " AND ".join(clauses)
    rows = db.fetchall(
        f"SELECT id, scope, kind, title, file_path, importance, created_at FROM memories WHERE {where} ORDER BY created_at DESC LIMIT ?",
        (*params, limit),
    )
    return {"memories": [dict(r) for r in rows]}


# ── Session/run replay ───────────────────────────────────────────────────────

@app.get("/api/v1/replay/{run_id}")
def replay(run_id: str, workspace_id: str = Query(...)):
    """Replay events for a specific agent run."""
    rows = db.fetchall(
        "SELECT * FROM events WHERE workspace_id=? AND object_id=? ORDER BY ts ASC",
        (workspace_id, run_id),
    )
    return {"events": [dict(r) for r in rows], "run_id": run_id}


# ── Burndown/analytics ───────────────────────────────────────────────────────

@app.get("/api/v1/analytics/burndown")
def burndown(workspace_id: str = Query(...), project_id: Optional[str] = Query(None)):
    issue_bd = _metrics.issue_burndown(workspace_id, project_id)
    task_bd = _metrics.task_burndown(workspace_id, project_id)
    return {"issue_burndown": issue_bd, "task_burndown": task_bd}


@app.get("/api/v1/analytics/summary")
def analytics_summary(workspace_id: str = Query(...)):
    return {
        "wip_count": _metrics.wip_count(workspace_id),
        "task_cycle_time_hours": _metrics.task_cycle_time(workspace_id),
        "throughput_daily_7d": _metrics.throughput_daily(workspace_id, days=7),
        "failed_run_rate": _metrics.failed_run_rate(workspace_id),
        "review_rejection_rate": _metrics.review_rejection_rate(workspace_id),
        "memory_scope_distribution": _metrics.memory_scope_distribution(workspace_id),
        "agent_run_summary": _metrics.agent_run_summary(workspace_id),
    }


# ── SSE event stream ─────────────────────────────────────────────────────────

@app.get("/api/v1/events/stream")
async def event_stream(workspace_id: str = Query(...),
                        project_id: Optional[str] = Query(None)):
    """SSE event stream. Spec §19.3."""
    async def generate() -> AsyncGenerator[dict, None]:
        last_seen_id = None
        while True:
            rows = db.fetchall(
                "SELECT * FROM events WHERE workspace_id=? ORDER BY ts DESC LIMIT 20",
                (workspace_id,),
            )
            for row in reversed(rows):
                row_dict = dict(row)
                evt_id = row_dict["id"]
                if evt_id != last_seen_id:
                    last_seen_id = evt_id
                    yield {
                        "event": row_dict["evt_type"],
                        "data": json.dumps(row_dict),
                        "id": evt_id,
                    }
            await asyncio.sleep(2.0)

    return EventSourceResponse(generate())


# ── Policy audit ─────────────────────────────────────────────────────────────

@app.get("/api/v1/policy/events")
def policy_events(workspace_id: str = Query(...), limit: int = Query(50)):
    rows = db.fetchall(
        "SELECT * FROM policy_events WHERE workspace_id=? ORDER BY timestamp DESC LIMIT ?",
        (workspace_id, limit),
    )
    return {"events": [dict(r) for r in rows]}


@app.get("/api/v1/sync/state")
def sync_state(workspace_id: str = Query(...)):
    from ..adapters.readers.sync_read import SyncStateReadAdapter, SyncConflictReadAdapter
    reader = SyncStateReadAdapter()
    conflict_reader = SyncConflictReadAdapter()
    return {
        "sync_states": reader.for_workspace(workspace_id),
        "pending_queue": reader.pending(workspace_id),
        "unresolved_conflicts": conflict_reader.unresolved_count(workspace_id),
        "drift_summary": reader.drift_summary(workspace_id),
    }


@app.get("/api/v1/teams")
def team_instances(workspace_id: str = Query(...),
                   status: Optional[str] = Query(None),
                   project_id: Optional[str] = Query(None)):
    """Team instance monitor view. Spec §15.4."""
    clauses = ["workspace_id=?"]
    params: list = [workspace_id]
    if status:
        clauses.append("status=?")
        params.append(status)
    if project_id:
        clauses.append("project_id=?")
        params.append(project_id)
    where = " AND ".join(clauses)
    rows = db.fetchall(
        f"SELECT * FROM team_instances WHERE {where} ORDER BY created_at DESC LIMIT 100",
        tuple(params),
    )
    from ..teams.scheduler import TeamScheduler
    scheduler = TeamScheduler()
    concurrency = scheduler.concurrency_report(workspace_id)
    return {
        "instances": [dict(r) for r in rows],
        "concurrency": concurrency,
    }


@app.get("/api/v1/analytics/per-role")
def analytics_per_role(workspace_id: str = Query(...)):
    """Per-role agent metrics view. Spec §20.5."""
    return {"metrics": _metrics.per_role_metrics(workspace_id)}


@app.get("/api/v1/analytics/memory")
def analytics_memory(workspace_id: str = Query(...)):
    """Memory effectiveness analytics. Spec §20.6."""
    return _metrics.memory_effectiveness(workspace_id)


@app.get("/api/v1/analytics/forecast")
def analytics_forecast(workspace_id: str = Query(...), project_id: Optional[str] = Query(None)):
    """Velocity-based delivery forecast. Spec §20.7."""
    return _metrics.forecasting_advisory(workspace_id, project_id=project_id)
