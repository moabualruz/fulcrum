"""
Chief of Staff context builder and response parser.

The CoS is spawned stateless on each invocation. Coherence comes from the
control plane — we inject a full world-state snapshot on every call, and
parse the CoS's structured JSON response back into control plane writes.

Cycle:
  1. CoSContextBuilder.build()  →  markdown snapshot (tasks, events, memories)
  2. spawn CoS with that snapshot injected into task_packet
  3. CoSResponseParser.apply()  →  writes TaskWriter/MemoryFacade/EventLog
  4. Next spawn sees the results of those writes

The CoS never needs to remember anything itself — the control plane does.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------

@dataclass
class CoSContextBuilder:
    """
    Assembles a world-state snapshot from the control plane for the CoS.

    Parameters
    ----------
    project_id:
        The project this CoS invocation is scoped to.
    workspace_id:
        Optional workspace scope for multi-project setups.
    max_tasks:
        Maximum tasks to include (sorted by recency).
    max_events:
        Recent events to include.
    max_memories:
        Top-K memories recalled for the current goal.
    memory_facade:
        Optional MemoryFacade instance for semantic recall.
        If None, memory section is omitted.
    """
    project_id: str
    workspace_id: Optional[str] = None
    max_tasks: int = 40
    max_events: int = 30
    max_memories: int = 15
    memory_facade: Any = None   # MemoryFacade | None

    def build(self, goal: str) -> str:
        """
        Build a markdown world-state snapshot to inject into the CoS task_packet.

        Parameters
        ----------
        goal:
            The high-level goal for this CoS cycle (used to focus memory recall).
        """
        sections: list[str] = []

        sections.append(f"## Current Goal\n{goal}")
        sections.append(self._tasks_section())
        sections.append(self._events_section())

        if self.memory_facade is not None:
            mem = self._memories_section(goal)
            if mem:
                sections.append(mem)

        sections.append(_RESPONSE_FORMAT_INSTRUCTION)

        return "\n\n---\n\n".join(s for s in sections if s)

    # ------------------------------------------------------------------

    def _tasks_section(self) -> str:
        try:
            from ..adapters.readers.task_read import TaskReadAdapter
            reader = TaskReadAdapter()
            filters: dict[str, Any] = {"project_id": self.project_id}
            if self.workspace_id:
                filters["workspace_id"] = self.workspace_id
            tasks = reader.list(filters, limit=self.max_tasks)
        except Exception as exc:
            log.warning("CoSContext: failed to read tasks: %s", exc)
            return ""

        if not tasks:
            return "## Tasks\n_No tasks yet._"

        # Group by status
        by_status: dict[str, list] = {}
        for t in tasks:
            s = t.status.value if hasattr(t.status, "value") else str(t.status)
            by_status.setdefault(s, []).append(t)

        lines = ["## Tasks"]
        status_order = ["in_progress", "blocked", "todo", "review", "done", "cancelled"]
        for status in status_order:
            bucket = by_status.get(status, [])
            if not bucket:
                continue
            lines.append(f"\n### {status.replace('_', ' ').title()} ({len(bucket)})")
            for t in bucket:
                assignee = f" → {t.assigned_agent_id}" if t.assigned_agent_id else ""
                blockers = f" ⚠ {'; '.join(t.blockers)}" if t.blockers else ""
                lines.append(f"- [{t.task_id}] {t.title}{assignee}{blockers}")
                if t.description:
                    lines.append(f"  {t.description[:120]}")

        # Remaining statuses not in order
        for status, bucket in by_status.items():
            if status not in status_order:
                lines.append(f"\n### {status} ({len(bucket)})")
                for t in bucket:
                    lines.append(f"- [{t.task_id}] {t.title}")

        return "\n".join(lines)

    def _events_section(self) -> str:
        try:
            from ..db import connection as db
            rows = db.fetchall(
                """SELECT evt_type, ts, actor_id, object_type, object_id, payload
                   FROM events
                   WHERE project_id=?
                   ORDER BY ts DESC LIMIT ?""",
                (self.project_id, self.max_events),
            )
        except Exception as exc:
            log.warning("CoSContext: failed to read events: %s", exc)
            return ""

        if not rows:
            return ""

        lines = ["## Recent Events"]
        for row in reversed(rows):   # chronological order
            ts = row["ts"][:16] if row["ts"] else "?"
            payload = json.loads(row["payload"] or "{}")
            note = payload.get("title") or payload.get("note") or payload.get("result") or ""
            obj = f"{row['object_type']}/{row['object_id']}" if row["object_id"] else ""
            lines.append(f"- {ts} `{row['evt_type']}` {obj} {note}".rstrip())

        return "\n".join(lines)

    def _memories_section(self, goal: str) -> str:
        try:
            memories = self.memory_facade.recall(
                goal,
                scope="project",
                scope_id=self.project_id,
                limit=self.max_memories,
            )
        except Exception as exc:
            log.warning("CoSContext: failed to recall memories: %s", exc)
            return ""

        if not memories:
            return ""

        lines = ["## Prior Decisions & Learnings"]
        for m in memories:
            content = m.get("content", m) if isinstance(m, dict) else str(m)
            lines.append(f"- {str(content)[:200]}")

        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Response format instruction embedded in every CoS prompt
# ---------------------------------------------------------------------------

_RESPONSE_FORMAT_INSTRUCTION = """\
## Your Response Format

Think step by step, then respond with a JSON block (fenced with ```json) containing:

```json
{
  "thinking": "brief reasoning about current state and next steps",
  "decisions": ["human-readable decision 1", "decision 2"],
  "create_tasks": [
    {
      "title": "...",
      "description": "...",
      "assigned_to": "implementer_backend|implementer_frontend|tester|reviewer|research_worker|integration_worker",
      "priority": "high|medium|low",
      "done_criteria": "..."
    }
  ],
  "update_tasks": [
    {
      "task_id": "tsk-...",
      "status": "in_progress|blocked|done|cancelled",
      "note": "reason for update"
    }
  ],
  "delegate_team": null,
  "memory_notes": ["important decision or fact to remember for future cycles"],
  "done": false
}
```

Set `done: true` only when the top-level goal is fully achieved.
`create_tasks` and `update_tasks` may be empty lists if no changes are needed.
"""


# ---------------------------------------------------------------------------
# Response parser — applies CoS JSON decisions to the control plane
# ---------------------------------------------------------------------------

@dataclass
class CoSResponseParser:
    """
    Parses the CoS's structured JSON response and applies it to the control plane.

    Writes:
      - TaskWriter.create()  for each entry in create_tasks
      - TaskWriter.update()  for each entry in update_tasks
      - MemoryFacade.write() for each entry in memory_notes
      - emit() a cos_decision event
    """
    project_id: str
    workspace_id: str
    memory_facade: Any = None   # MemoryFacade | None

    def apply(self, cos_output: str) -> "CoSDecision":
        """
        Parse `cos_output` (the CoS's text response) and write to control plane.

        Returns a CoSDecision with the parsed data and any errors encountered.
        """
        decision = self._parse(cos_output)

        if decision.parse_error:
            log.warning("CoS response parse error: %s", decision.parse_error)
            return decision

        self._apply_create_tasks(decision)
        self._apply_update_tasks(decision)
        self._apply_memory_notes(decision)
        self._emit_decision_event(decision)

        return decision

    # ------------------------------------------------------------------

    def _parse(self, text: str) -> "CoSDecision":
        # Extract JSON from fenced code block
        match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
        if not match:
            # Try bare JSON object
            match = re.search(r"(\{[^{}]*\"thinking\"[^{}]*\})", text, re.DOTALL)
        if not match:
            return CoSDecision(raw=text, parse_error="No JSON block found in CoS response")

        try:
            data = json.loads(match.group(1))
        except json.JSONDecodeError as exc:
            return CoSDecision(raw=text, parse_error=f"JSON parse error: {exc}")

        return CoSDecision(
            raw=text,
            thinking=data.get("thinking", ""),
            decisions=data.get("decisions", []),
            create_tasks=data.get("create_tasks", []),
            update_tasks=data.get("update_tasks", []),
            delegate_team=data.get("delegate_team"),
            memory_notes=data.get("memory_notes", []),
            done=bool(data.get("done", False)),
        )

    def _apply_create_tasks(self, decision: "CoSDecision") -> None:
        if not decision.create_tasks:
            return
        try:
            from ..adapters.readers.task_read import TaskWriter
            from ..models.task import Task, TaskStatus
            from ..ids import generate_id, TASK_PREFIX
        except ImportError as exc:
            log.error("CoSParser: cannot import TaskWriter: %s", exc)
            return

        writer = TaskWriter()
        for spec in decision.create_tasks:
            try:
                task = Task(
                    task_id=generate_id(TASK_PREFIX),
                    workspace_id=self.workspace_id,
                    project_id=self.project_id,
                    display_id=f"T-{datetime.now(timezone.utc).strftime('%H%M%S')}",
                    title=spec.get("title", "Untitled task"),
                    description=spec.get("description", ""),
                    status=TaskStatus.todo,
                    priority=spec.get("priority", "medium"),
                    assigned_agent_id=spec.get("assigned_to"),
                    done_criteria=spec.get("done_criteria"),
                )
                writer.create(task)
                decision.created_task_ids.append(task.task_id)
                log.info("CoS created task %s: %s", task.task_id, task.title)
            except Exception as exc:
                log.error("CoS create_task failed for %r: %s", spec.get("title"), exc)
                decision.errors.append(f"create_task({spec.get('title')}): {exc}")

    def _apply_update_tasks(self, decision: "CoSDecision") -> None:
        if not decision.update_tasks:
            return
        try:
            from ..adapters.readers.task_read import TaskWriter
        except ImportError as exc:
            log.error("CoSParser: cannot import TaskWriter: %s", exc)
            return

        writer = TaskWriter()
        for upd in decision.update_tasks:
            task_id = upd.get("task_id")
            if not task_id:
                continue
            updates: dict[str, Any] = {}
            if "status" in upd:
                updates["status"] = upd["status"]
            if "note" in upd:
                updates["blockers"] = [upd["note"]] if upd["note"] else []
            if updates:
                try:
                    writer.update(task_id, updates)
                    log.info("CoS updated task %s: %s", task_id, updates)
                except Exception as exc:
                    log.error("CoS update_task(%s) failed: %s", task_id, exc)
                    decision.errors.append(f"update_task({task_id}): {exc}")

    def _apply_memory_notes(self, decision: "CoSDecision") -> None:
        if not decision.memory_notes or self.memory_facade is None:
            return
        for note in decision.memory_notes:
            try:
                self.memory_facade.write(
                    content=note,
                    scope="project",
                    scope_id=self.project_id,
                    tags=["cos_decision"],
                )
            except Exception as exc:
                log.warning("CoS memory write failed: %s", exc)

    def _emit_decision_event(self, decision: "CoSDecision") -> None:
        try:
            from ..events.store import emit
            from ..models.events import EventType
            emit(
                EventType.task_created,   # reuse closest event type; extend EventType if needed
                workspace_id=self.workspace_id,
                project_id=self.project_id,
                actor_type="agent",
                actor_id="chief_of_staff",
                object_type="cos_decision",
                object_id=None,
                payload={
                    "thinking": decision.thinking[:500] if decision.thinking else "",
                    "decisions": decision.decisions[:5],
                    "tasks_created": len(decision.created_task_ids),
                    "tasks_updated": len(decision.update_tasks),
                    "done": decision.done,
                },
            )
        except Exception as exc:
            log.warning("CoS emit event failed: %s", exc)


# ---------------------------------------------------------------------------
# Data class for a parsed CoS decision
# ---------------------------------------------------------------------------

@dataclass
class CoSDecision:
    raw: str
    thinking: str = ""
    decisions: list[str] = field(default_factory=list)
    create_tasks: list[dict] = field(default_factory=list)
    update_tasks: list[dict] = field(default_factory=list)
    delegate_team: Optional[str] = None
    memory_notes: list[str] = field(default_factory=list)
    done: bool = False
    # Set after apply()
    created_task_ids: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    parse_error: Optional[str] = None

    def summary(self) -> str:
        if self.parse_error:
            return f"[parse error: {self.parse_error}]"
        parts = []
        if self.thinking:
            parts.append(self.thinking[:120])
        if self.created_task_ids:
            parts.append(f"created {len(self.created_task_ids)} tasks")
        if self.update_tasks:
            parts.append(f"updated {len(self.update_tasks)} tasks")
        if self.done:
            parts.append("GOAL COMPLETE")
        return " | ".join(parts) or "(no changes)"


# ---------------------------------------------------------------------------
# Convenience: build a full CoS task_packet for spawn_agent()
# ---------------------------------------------------------------------------

def build_cos_task_packet(
    goal: str,
    project_id: str,
    workspace_id: str,
    memory_facade: Any = None,
    max_tasks: int = 40,
    max_events: int = 30,
    max_memories: int = 15,
) -> dict:
    """
    Build a task_packet ready for spawn_agent(profile_id='chief_of_staff', ...).

    Injects full world-state so the CoS can make coherent decisions without
    any session history.
    """
    builder = CoSContextBuilder(
        project_id=project_id,
        workspace_id=workspace_id,
        max_tasks=max_tasks,
        max_events=max_events,
        max_memories=max_memories,
        memory_facade=memory_facade,
    )
    world_state = builder.build(goal)

    return {
        "_instruction": (
            f"You are the Chief of Staff for this project.\n\n"
            f"{world_state}"
        ),
    }
