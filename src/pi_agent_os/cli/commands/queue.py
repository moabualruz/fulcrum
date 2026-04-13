"""Merge queue CLI commands. Spec §18."""
from __future__ import annotations
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap

app = typer.Typer()
console = Console()


@app.command("show")
def show(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    project_id: Optional[str] = typer.Option(None, "--project", "-p"),
) -> None:
    """Show the current merge queue."""
    bootstrap()
    from ...db import connection as db

    clauses = ["workspace_id=?"]
    params: list = [workspace_id]
    if project_id:
        clauses.append("project_id=?")
        params.append(project_id)
    where = " AND ".join(clauses)
    rows = db.fetchall(
        f"SELECT * FROM merge_queue_projection WHERE {where} ORDER BY queued_at ASC",
        tuple(params),
    )
    if not rows:
        console.print("[green]Merge queue is empty.[/green]")
        return
    table = Table("Worktree ID", "Branch", "Status", "Project", "Queued At")
    for r in rows:
        status_color = {"queued": "yellow", "merging": "cyan", "merged": "green", "blocked": "red"}.get(
            str(r["status"]), "white"
        )
        table.add_row(
            r["worktree_id"],
            r["branch_name"] or "—",
            f"[{status_color}]{r['status']}[/{status_color}]",
            r["project_id"] or "—",
            str(r["queued_at"])[:19],
        )
    console.print(table)


@app.command("drain")
def drain(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    project_id: str = typer.Option(..., "--project", "-p"),
    project_root: str = typer.Option(..., "--root", help="Path to the git project root"),
    actor_id: str = typer.Option("integration_worker_cli", "--actor"),
    target_branch: str = typer.Option("main", "--target"),
    skip_gates: bool = typer.Option(False, "--skip-gates", help="Skip artifact gates (UNSAFE)"),
    max_items: int = typer.Option(20, "--max", "-n"),
) -> None:
    """Drain the merge queue (integration_worker role required)."""
    bootstrap()
    from ...worktrees.integration_worker import IntegrationWorker

    worker = IntegrationWorker(
        workspace_id=workspace_id,
        project_id=project_id,
        project_root=project_root,
        actor_id=actor_id,
        actor_role="integration_worker",
        require_review=not skip_gates,
        require_tests=not skip_gates,
    )
    results = worker.drain(target_branch=target_branch, max_items=max_items, skip_gates=skip_gates)
    for r in results:
        status = r.get("status", "unknown")
        color = {"merged": "green", "empty": "dim", "gate_failed": "red", "error": "red"}.get(status, "yellow")
        wt = r.get("worktree_id", "—")
        msg = r.get("message", r.get("error", ""))
        console.print(f"[{color}]{status}[/{color}]  {wt}  {msg}")
    merged = sum(1 for r in results if r.get("status") == "merged")
    console.print(f"\n[bold]{merged}[/bold] merged, {len(results)} processed total.")
